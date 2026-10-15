"""Errors with a structured payload, so that HTTP layers can answer with JSON."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FieldError:
    path: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"path": self.path, "message": self.message}


@dataclass
class ContractError(Exception):
    """The request does not follow the contract. Maps to HTTP 400."""

    message: str
    details: list[FieldError] = field(default_factory=list)
    code: str = "invalid_request"

    def __str__(self) -> str:
        if not self.details:
            return self.message
        return f"{self.message}: " + "; ".join(f"{d.path}: {d.message}" for d in self.details)

    def to_dict(self) -> dict[str, object]:
        return {"code": self.code, "message": self.message, "details": [d.to_dict() for d in self.details]}


class LimitError(ContractError):
    """The request is valid but too large for a synchronous run. Maps to HTTP 422."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, details=[], code="too_large")


class BpmnError(ContractError):
    """A BPMN document could not be read."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, details=[], code="invalid_bpmn")
