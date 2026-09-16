"""MLP minuscule en numpy : régression hétéroscédastique ou classification."""

from __future__ import annotations

from typing import Any, Literal

import numpy as np

Kind = Literal["regression", "classes", "binary"]


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0)


def log_softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    log_z = np.log(np.exp(shifted).sum(axis=1, keepdims=True) + 1e-12)
    return shifted - log_z


def softmax(logits: np.ndarray) -> np.ndarray:
    return np.exp(log_softmax(logits))


class TinyMLP:
    """Une couche cachée. Sortie : (μ, log σ) ou logits de classes."""

    def __init__(self, n_in: int, n_hidden: int, n_out: int, seed: int = 0) -> None:
        rng = np.random.default_rng(int(seed))
        scale1 = np.sqrt(2.0 / max(n_in, 1))
        scale2 = np.sqrt(2.0 / max(n_hidden, 1))
        self.W1 = rng.normal(0.0, scale1, (n_in, n_hidden))
        self.b1 = np.zeros(n_hidden)
        self.W2 = rng.normal(0.0, scale2, (n_hidden, n_out))
        self.b2 = np.zeros(n_out)
        self.n_in = int(n_in)
        self.n_hidden = int(n_hidden)
        self.n_out = int(n_out)

    def params(self) -> list[np.ndarray]:
        return [self.W1, self.b1, self.W2, self.b2]

    def forward(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        hidden = relu(x @ self.W1 + self.b1)
        return hidden @ self.W2 + self.b2, hidden

    def dump(self) -> dict[str, Any]:
        return {
            "W1": self.W1,
            "b1": self.b1,
            "W2": self.W2,
            "b2": self.b2,
            "n_in": self.n_in,
            "n_hidden": self.n_hidden,
            "n_out": self.n_out,
        }

    @classmethod
    def load(cls, payload: dict[str, Any]) -> TinyMLP:
        net = cls(int(payload["n_in"]), int(payload["n_hidden"]), int(payload["n_out"]))
        net.W1 = np.array(payload["W1"], dtype=float)
        net.b1 = np.array(payload["b1"], dtype=float)
        net.W2 = np.array(payload["W2"], dtype=float)
        net.b2 = np.array(payload["b2"], dtype=float)
        return net


def _adam_step(
    param: np.ndarray,
    grad: np.ndarray,
    m: np.ndarray,
    v: np.ndarray,
    t: int,
    lr: float,
    beta1: float = 0.9,
    beta2: float = 0.999,
    eps: float = 1e-8,
) -> None:
    m *= beta1
    m += (1.0 - beta1) * grad
    v *= beta2
    v += (1.0 - beta2) * (grad * grad)
    m_hat = m / (1.0 - beta1**t)
    v_hat = v / (1.0 - beta2**t)
    param -= lr * m_hat / (np.sqrt(v_hat) + eps)


def fit_mlp(
    x: np.ndarray,
    y: np.ndarray,
    *,
    kind: Kind,
    n_hidden: int = 16,
    epochs: int = 80,
    lr: float = 0.01,
    batch: int = 32,
    l2: float = 1e-3,
    seed: int = 0,
    n_classes: int = 2,
) -> TinyMLP:
    n_in = int(x.shape[1])
    n_out = 2 if kind == "regression" else int(n_classes)
    net = TinyMLP(n_in, n_hidden, n_out, seed=seed)
    rng = np.random.default_rng(int(seed) + 7)
    n = int(x.shape[0])
    if n == 0:
        return net
    batch_size = max(1, min(int(batch), n))
    moments = [(np.zeros_like(p), np.zeros_like(p)) for p in net.params()]
    step = 0
    for _ in range(max(1, int(epochs))):
        order = rng.permutation(n)
        for start in range(0, n, batch_size):
            idx = order[start : start + batch_size]
            xb = x[idx]
            yb = y[idx]
            logits, hidden = net.forward(xb)
            n_b = xb.shape[0]
            if kind == "regression":
                mu = logits[:, 0]
                log_sigma = np.clip(logits[:, 1], -5.0, 2.0)
                resid = mu - yb
                inv_var = np.exp(-2.0 * log_sigma)
                # dL/dmu = resid * inv_var ; dL/dlogσ = 1 - resid² inv_var
                d_mu = resid * inv_var / n_b
                d_ls = (1.0 - (resid * resid) * inv_var) / n_b
                d_out = np.stack([d_mu, d_ls], axis=1)
            else:
                classes = yb.astype(int)
                log_p = log_softmax(logits)
                probs = np.exp(log_p)
                d_out = probs / n_b
                d_out[np.arange(n_b), classes] -= 1.0 / n_b
            d_W2 = hidden.T @ d_out + l2 * net.W2
            d_b2 = d_out.sum(axis=0)
            d_hidden = d_out @ net.W2.T
            d_hidden *= (hidden > 0).astype(float)
            d_W1 = xb.T @ d_hidden + l2 * net.W1
            d_b1 = d_hidden.sum(axis=0)
            grads = [d_W1, d_b1, d_W2, d_b2]
            step += 1
            for param, grad, (m, v) in zip(net.params(), grads, moments):
                np.clip(grad, -5.0, 5.0, out=grad)
                _adam_step(param, grad, m, v, step, lr)
    return net


def predict_regression(net: TinyMLP, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    logits, _ = net.forward(x)
    mu = logits[:, 0]
    sigma = np.exp(np.clip(logits[:, 1], -5.0, 2.0))
    return mu, sigma


def predict_proba(net: TinyMLP, x: np.ndarray) -> np.ndarray:
    logits, _ = net.forward(x)
    return softmax(logits)
