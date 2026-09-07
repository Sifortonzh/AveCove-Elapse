# Canonical Curriculum / 标准课程树

The two user-designated curriculum PDFs are authoritative for this import project; benchmark-book TOCs are not. All 9 canonical PDF pages were inspected. Generated seeds retain file hash, source PDF page, printed content page, source numbering and original line text. Where a text search is ambiguous, bbox is null, never fabricated.

| Course | Canonical source | Nodes | Shape |
| --- | --- | --- | --- |
| 传染病学 | `27传染病学_目录.pdf` | 141 | chapter → section → subsection; some direct chapter → subsection; appendix |
| 皮肤性病学 | `31皮肤性病学_目录.pdf` | 160 | part → chapter → section |

The seed version is `user-provided-2026-09-06`; the source excerpts do not establish an edition number. Stable node IDs hash course/parent/source label/title. Parent references, not columns like chapter/section, define arbitrary depth. Order is explicit. Cross-page parent state is retained: infectious Ch5 continues on PDF p3; Ch9吸虫病 subsections continue on p4.

Rebuild from original authorized sources:

```sh
.venv-forge/bin/python forge/tools/build_curriculums.py --source /path/to/curriculums
```

This extractor is a seed-building utility for the designated TOC layouts, NOT a universal OCR chapter parser. New curricula require source inspection, output review and tests before replacing canonical data.

Matching order implemented: exact title → normalized title (number/punctuation/space removal) → alias. Only unique matches return a node. Fuzzy SequenceMatcher returns up to three candidates at similarity >=0.5, never an automatic node and never an OCR confidence. AI semantic mapping is an explicit next-stage extension, not implemented. Alias lists start empty; add reviewed aliases with source reasons rather than making disease equivalence guesses.

`scope` on a question describes source-book identity. `curriculum_node` describes canonical identity. They may differ. Unresolved course/node prevents phase-1 export. The minimal UI currently edits node IDs via structured JSON; a searchable tree picker is a next-stage task.

Elapse receives a flattened full path as `category` and notes such as `原题号 1、3、7 → 传染病学 / 病毒性疾病 / 病毒性肝炎`. Do not write a range implying missing questions exist. Provenance sidecar preserves the full internal data; the legacy browser storage has no canonical-tree migration in this phase.
