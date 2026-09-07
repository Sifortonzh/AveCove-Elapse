# Benchmark / 真实样本与评测边界

Raw sample PDFs remain outside Git. `forge/benchmarks/preflight.json` records file names, hashes, page counts, rotations, text-layer observations and runtime readiness. Both scans have zero text-layer pages; extracting PDF text cannot substitute for OCR.

## Inspected sources

| Sample | Physical PDF pages | Observed structure |
| --- | --- | --- |
| 传染指导与习题集配套第九版_演示.pdf | 21 | p1–3 learning summaries; p4 onward objectives; p9 A2; p10–11 shared A3/A4; p12–13 B1; p13–19 answer/explanation region; p19–21 subjective content / next section |
| 妇产科学复习考试指导（军医）_演示.pdf | 10 | double physical-book-page scans, multiple columns; p1 preface/TOC; p2–4 summaries; p4–8 mixed questions; p8 concentrated answers; p9–10 later analysis/next chapter |

These are visual region observations, NOT manually verified question inventories. Infectious pages rotate 90 degrees; military PDF includes 90 and 270 degrees. All pages were visually inspected using contact sheets. Targeted high-resolution OCR+ground-truth inspection remains necessary.

## Ground truth contract

`benchmark.py:GroundTruth` and `ground-truth.schema.json` define independent annotation_id, source hash, canonical version, reviewer, coverage pages, complete-inventory flag and GoldQuestions. Each contains type/number/scope/stem/options/answer, optional explanation/canonical node and separate source anchors. Null means not annotated, not wrong or absent. Use human-independent identities/locations for alignment; never match only by predicted number then report perfect number accuracy.

Future evaluator must report denominators and annotated coverage:

- Detection: precision/recall against a complete human question inventory within covered pages.
- Number/type: correct labels among independently matched detected questions; report missed items separately.
- Options: exact label/text completeness, with explicitly documented whitespace normalization.
- Answer matching: exact answer set AND correct source-question association.
- Explanation matching: source linkage separately from text fidelity.
- Curriculum: exact canonical ID within the specified tree version.
- Schema validity: validated outputs / attempted outputs, including malformed responses.

No gold annotations or alignment evaluator are completed in this phase. `observed()` intentionally reports counts with null accuracy metrics. Never compare synthetic test pass rate with real OCR quality.

## Automated synthetic regression coverage

Tests construct clearly labeled artificial documents: p10 stem, p11 continued option, p80 answer, p90 explanation; duplicate numbering and mismatched scope; invalid registries; missing confidence; cyclic curriculum; medical typography; answer/option mismatch; real Elapse importer contract; stale leases/revisions; page-2 failure with page-1 reuse; auth/upload/page-render/review/export. No commercial question content is embedded as gold truth.

First real-engine acceptance should inspect two adjacent infectious pages, then the military answer grid. Record engine version/backend/model revision/hardware, duration, peak memory, raw files and normalized Document. Until this exists, do not advertise a measured recognition rate or faster import speed.
