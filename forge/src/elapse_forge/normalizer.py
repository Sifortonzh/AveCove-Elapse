"""Typography-only changes; ambiguous medical glyphs are proposals, never corrections."""

import re
import unicodedata

from .models import Model


class Normalization(Model):
    original_text: str
    normalized_text: str
    reason: str
    confidence: float | None = None
    requires_review: bool = False


class MedicalNormalizer:
    terms = (
        "HBsAg",
        "HBeAg",
        "IgG",
        "IgM",
        "FSH",
        "LH",
        "hCG",
        "WBC",
        "RBC",
        "PLT",
        "PaO2",
        "PaCO2",
        "mmol/L",
        "μmol/L",
        "10^9/L",
    )

    def normalize(self, text: str) -> list[Normalization]:
        # Avoid NFKC across the whole string: it would change superscript units.
        normalized = "".join(
            unicodedata.normalize("NFKC", c) if "\uff01" <= c <= "\uff5e" else c
            for c in text
        )
        changes = []
        if normalized != text:
            changes.append(
                Normalization(
                    original_text=text,
                    normalized_text=normalized,
                    reason="fullwidth-ascii",
                )
            )
        if re.search(r"\b(?:Pa[O0][2Z]|PaC[O0]2|[uμ]mol/L|Ig[Gl1]|HB[Ss5]Ag)\b", text):
            changes.append(
                Normalization(
                    original_text=text,
                    normalized_text=text,
                    reason="medical-token-needs-source-check",
                    requires_review=True,
                )
            )
        return changes
