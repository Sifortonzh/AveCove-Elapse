import re
import unicodedata
from difflib import SequenceMatcher

from .models import Curriculum, Model


def normalize_title(title: str) -> str:
    title = unicodedata.normalize("NFKC", title)
    title = re.sub(r"^第[一二三四五六七八九十百\d]+[篇章节]\s*", "", title)
    return re.sub(r"[\s·、，。:：()（）]", "", title).casefold()


class Match(Model):
    node_id: str | None = None
    method: str
    candidates: list[str] = []
    similarity: float | None = None  # Similarity is NOT OCR confidence.


def match_curriculum(title: str, tree: Curriculum) -> Match:
    if not title.strip():
        return Match(method="unmapped")
    for method, predicate in [
        ("exact", lambda n: n.title == title),
        ("normalized", lambda n: n.normalized_title == normalize_title(title)),
        (
            "alias",
            lambda n: normalize_title(title) in [normalize_title(a) for a in n.aliases],
        ),
    ]:
        hits = [n.id for n in tree.nodes if predicate(n)]
        if hits:
            return Match(
                node_id=hits[0] if len(hits) == 1 else None,
                method=method,
                candidates=hits,
            )
    ranked = sorted(
        (
            (
                SequenceMatcher(
                    None, normalize_title(title), n.normalized_title
                ).ratio(),
                n.id,
            )
            for n in tree.nodes
        ),
        reverse=True,
    )
    # Fuzzy matches are proposals. No calibration dataset exists yet.
    return Match(
        method="fuzzy_review",
        candidates=[i for score, i in ranked[:3] if score >= 0.5],
        similarity=ranked[0][0] if ranked else None,
    )


def node_path(tree: Curriculum, node_id: str) -> str:
    index = {n.id: n for n in tree.nodes}
    titles = []
    node = index[node_id]
    while True:
        titles.append(node.title)
        if node.parent_id is None:
            break
        node = index[node.parent_id]
    return " / ".join([tree.title] + list(reversed(titles)))
