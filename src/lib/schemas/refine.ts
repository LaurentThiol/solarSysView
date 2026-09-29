type Box = { x: number; y: number; width: number; height: number }

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function center(box: Box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function overlapArea(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  return width * height
}

function shifted(box: Box, dx: number, dy: number): Box {
  return { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height }
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y }
}

function shapeOverlap(box: Box, shapes: Box[]) {
  return shapes.reduce((sum, shape) => sum + overlapArea(box, shape), 0)
}

function translate(element: SVGElement, ux: number, uy: number) {
  const current = element.getAttribute("transform") ?? ""
  element.setAttribute("transform", `${current} translate(${ux} ${uy})`.trim())
}

function move(svg: SVGSVGElement, element: SVGGraphicsElement, dx: number, dy: number) {
  const matrix = svg.getScreenCTM()
  if (!matrix || !matrix.a || !matrix.d) return
  const ux = dx / matrix.a
  const uy = dy / matrix.d
  const plate = element.previousElementSibling
  if (plate instanceof SVGElement && plate.dataset.schemaPlate === "1") translate(plate, ux, uy)
  translate(element, ux, uy)
}

function itemBox(element: SVGTextElement): Box {
  const text = boxOf(element)
  const plate = element.previousElementSibling
  if (plate instanceof SVGElement && plate.dataset.schemaPlate === "1") return union([text, boxOf(plate)])
  return text
}

function isBoundaryText(element: SVGTextElement) {
  return Boolean(element.parentElement?.querySelector("rect[stroke-dasharray]"))
}

function linkLabels(svg: SVGSVGElement) {
  return [...svg.querySelectorAll("text")].filter((element): element is SVGTextElement => {
    if (!(element instanceof SVGTextElement)) return false
    if (isBoundaryText(element)) return false
    const plate = element.previousElementSibling
    return plate instanceof SVGElement && plate.dataset.schemaPlate === "1"
  })
}

function boundaryObstacles(svg: SVGSVGElement) {
  return [...svg.querySelectorAll("text")].flatMap((element) => {
    if (!(element instanceof SVGTextElement) || !isBoundaryText(element)) return []
    return [itemBox(element)]
  })
}

function cluster(labels: SVGTextElement[]) {
  const items = labels.map((element) => ({ element, box: itemBox(element) }))
  const used = new Set<SVGTextElement>()
  const groups: { element: SVGTextElement; box: Box }[][] = []
  const near = (a: Box, b: Box) => {
    const left = center(a)
    const right = center(b)
    return Math.abs(left.x - right.x) < 110 && Math.abs(left.y - right.y) < 40
  }
  for (const item of items) {
    if (used.has(item.element)) continue
    const group = [item]
    used.add(item.element)
    let grew = true
    while (grew) {
      grew = false
      for (const other of items) {
        if (used.has(other.element)) continue
        if (group.some((member) => near(member.box, other.box))) {
          group.push(other)
          used.add(other.element)
          grew = true
        }
      }
    }
    groups.push(group)
  }
  return groups
}

function exits(box: Box, shape: Box, pad: number) {
  return [
    { dx: shape.x - (box.x + box.width) - pad, dy: 0 },
    { dx: shape.x + shape.width + pad - box.x, dy: 0 },
    { dx: 0, dy: shape.y - (box.y + box.height) - pad },
    { dx: 0, dy: shape.y + shape.height + pad - box.y },
  ]
}

function pushGroupsOffShapes(svg: SVGSVGElement, shapes: Box[]) {
  for (let pass = 0; pass < 12; pass++) {
    let moved = false
    for (const group of cluster(linkLabels(svg))) {
      const box = union(group.map((item) => item.box))
      const before = shapeOverlap(box, shapes)
      if (before <= 0) continue
      const worst = shapes.reduce(
        (best, shape) => {
          const area = overlapArea(box, shape)
          return area > best.area ? { shape, area } : best
        },
        { shape: shapes[0], area: -1 }
      )
      let choice: { dx: number; dy: number; score: number; dist: number } | null = null
      for (const option of exits(box, worst.shape, 12)) {
        const score = shapeOverlap(shifted(box, option.dx, option.dy), shapes)
        if (score >= before) continue
        const dist = Math.hypot(option.dx, option.dy)
        if (!choice || score < choice.score - 1 || (Math.abs(score - choice.score) <= 1 && dist < choice.dist)) {
          choice = { ...option, score, dist }
        }
      }
      if (!choice) continue
      for (const item of group) move(svg, item.element, choice.dx, choice.dy)
      moved = true
    }
    if (!moved) break
  }
}

function spreadLabels(svg: SVGSVGElement, shapes: Box[]) {
  for (let pass = 0; pass < 24; pass++) {
    const items = linkLabels(svg).map((element) => ({ element, box: itemBox(element) }))
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].box
        const b = items[j].box
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if ((overlapX <= 1 || overlapY <= 1) && gap(a, b) >= 6) continue
        const ac = center(a)
        const bc = center(b)
        const pad = 8
        const steps: { dx: number; dy: number }[] = []
        if (overlapX > 1 && overlapY > 1) {
          const pushX = (overlapX + pad) * (bc.x >= ac.x ? 1 : -1)
          const pushY = (overlapY + pad) * (bc.y >= ac.y ? 1 : -1)
          if (Math.abs(pushY) <= Math.abs(pushX)) steps.push({ dx: 0, dy: pushY }, { dx: pushX, dy: 0 })
          else steps.push({ dx: pushX, dy: 0 }, { dx: 0, dy: pushY })
        } else if (Math.abs(bc.y - ac.y) >= Math.abs(bc.x - ac.x)) {
          steps.push({ dx: 0, dy: bc.y >= ac.y ? pad : -pad })
        } else {
          steps.push({ dx: bc.x >= ac.x ? pad : -pad, dy: 0 })
        }
        const others = items.filter((_, index) => index !== j)
        const beforeLabels = others.reduce((sum, item) => sum + overlapArea(b, item.box), 0)
        let choice: { dx: number; dy: number } | null = null
        for (const step of steps) {
          const next = shifted(b, step.dx, step.dy)
          if (shapeOverlap(next, shapes) > shapeOverlap(b, shapes) + 12) continue
          const afterLabels = others.reduce((sum, item) => sum + overlapArea(next, item.box), 0)
          if (afterLabels > beforeLabels + 4) continue
          choice = step
          break
        }
        if (!choice) continue
        move(svg, items[j].element, choice.dx, choice.dy)
        items[j].box = shifted(b, choice.dx, choice.dy)
        moved = true
      }
    }
    if (!moved) break
  }
}

function gap(a: Box, b: Box) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width))
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height))
  if (dx === 0) return dy
  if (dy === 0) return dx
  return Math.hypot(dx, dy)
}

function cropToContent(svg: SVGSVGElement) {
  const box = svg.getBBox()
  if (!box.width || !box.height) return
  const pad = 18
  svg.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`)
  svg.setAttribute("width", String(box.width + pad * 2))
  svg.setAttribute("height", String(box.height + pad * 2))
}

/** Écarte les libellés de lien des boîtes, puis cadre le dessin sur son contenu. */
export function refineSchemaSvg(svg: SVGSVGElement) {
  if (svg.dataset.schemaRefined === "1") return
  svg.dataset.schemaRefined = "1"
  const shapes = [
    ...[...svg.querySelectorAll(".c4-shape")].map((element) => boxOf(element)),
    ...boundaryObstacles(svg),
  ]
  if (shapes.length && linkLabels(svg).length) {
    pushGroupsOffShapes(svg, shapes)
    spreadLabels(svg, shapes)
  }
  cropToContent(svg)
}
