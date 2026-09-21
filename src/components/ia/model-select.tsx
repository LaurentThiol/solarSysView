"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { modelLabel, type IaModelOption } from "@/lib/ia/models"

export function ModelSelect({
  value,
  models,
  onChange,
  label = "Modèle",
  groups,
}: {
  value: string | null
  models: IaModelOption[]
  onChange: (id: string | null) => void
  label?: string
  groups: Array<{ label: string; items: IaModelOption[] }>
}) {
  const current = models.find((item) => item.id === value) ?? null
  // null is a controlled empty value; undefined would start the Select uncontrolled.
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? null)}>
      <SelectTrigger className="w-full sm:w-64" aria-label={label}>
        <span className="flex flex-1 text-left">
          {current ? current.label : "Choisir un modèle"}
        </span>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="min-w-[min(18rem,calc(100vw-1.5rem))]">
        {groups.map((group) =>
          group.items.length ? (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {`${item.label} · ${item.hint}`}
                  </SelectItem>
                ))}
            </SelectGroup>
          ) : null
        )}
        {value && !models.some((item) => item.id === value) ? (
          <SelectItem value={value}>{modelLabel(value)}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  )
}
