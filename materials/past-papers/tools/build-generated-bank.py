#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parents[1]
RAW_DIR = ROOT / "raw"
EXTRACTED_DIR = ROOT / "extracted"
PDF_TEXT_DIR = ROOT / "text" / "pdf"
STRUCTURED_DIR = ROOT / "structured"
SRC_OUTPUT = PROJECT_ROOT / "src" / "data" / "generatedPastPapers.ts"
UPDATED_AT = "2026-07-05"


@dataclass(frozen=True)
class CourseMeta:
    course_id: str
    code: str
    name: str
    exam_minutes: int
    chapters: dict[str, list[str]]


@dataclass(frozen=True)
class SourceMeta:
    course_id: str
    paper_id: str
    title: str
    year: int
    session: str
    filename: str
    parser: str
    start_number: int | None = None
    min_number: int | None = None
    max_number: int | None = None
    total_score: int = 100

    @property
    def file_path(self) -> Path:
        path = Path(self.filename)
        if path.parts and path.parts[0] in {"raw", "extracted"}:
            return ROOT / path
        return RAW_DIR / self.filename


COURSES: dict[str, CourseMeta] = {
    "xi": CourseMeta(
        course_id="xi",
        code="15040",
        name="习近平新时代中国特色社会主义思想概论",
        exam_minutes=150,
        chapters={
            "xi-1": ["中国特色社会主义", "中国式现代化", "四个自信", "党的领导", "两个确立", "人民立场"],
            "xi-2": ["五位一体", "四个全面", "新发展理念", "高质量发展", "乡村振兴", "共同富裕", "总体国家安全观"],
            "xi-3": ["时政", "二十届三中全会", "形势", "政策", "人类命运共同体", "和平发展"],
        },
    ),
    "history": CourseMeta(
        course_id="history",
        code="15043",
        name="中国近现代史纲要",
        exam_minutes=150,
        chapters={
            "history-1": ["鸦片战争", "反侵略", "近代社会", "三元里", "主要矛盾", "历史任务"],
            "history-2": ["太平天国", "洋务运动", "戊戌", "辛亥", "孙中山", "同盟会", "保路运动"],
            "history-3": ["五四", "中国共产党", "土地革命", "抗日", "解放战争", "井冈山", "苏维埃"],
            "history-4": ["新中国", "社会主义改造", "改革开放", "十一届三中全会", "新时代", "联合国"],
        },
    ),
    "marx": CourseMeta(
        course_id="marx",
        code="15044",
        name="马克思主义基本原理",
        exam_minutes=150,
        chapters={
            "marx-0": ["马克思主义", "基本特征", "科学性", "革命性", "时代产物", "空想社会主义"],
            "marx-1": ["物质", "意识", "实践", "规律", "矛盾", "辩证法", "运动", "静止"],
            "marx-2": ["认识", "真理", "谬误", "价值", "感性认识", "理性认识"],
            "marx-3": ["社会存在", "社会意识", "人民群众", "生产方式", "社会基本矛盾", "阶级斗争"],
            "marx-4": ["商品", "价值", "剩余价值", "资本", "垄断", "社会主义", "共产主义", "经济全球化"],
        },
    ),
}


SOURCES: list[SourceMeta] = [
    SourceMeta(
        course_id="xi",
        paper_id="generated-xi-2025-10",
        title="15040 2025 年 10 月真题答案解析",
        year=2025,
        session="10月",
        filename="xi-1270151-2025年10月《习概》真题答案解析-完整版.pdf",
        parser="numbered",
        min_number=1,
        max_number=31,
    ),
    SourceMeta(
        course_id="xi",
        paper_id="generated-xi-2025-04-choice",
        title="15040 2025 年 4 月选择题真题",
        year=2025,
        session="4月",
        filename="xi-1146671-2025年4月自学考试《新中概》选择题真题及答案-回忆版.pdf",
        parser="numbered",
        min_number=1,
        max_number=25,
        total_score=50,
    ),
    SourceMeta(
        course_id="xi",
        paper_id="generated-xi-2025-04-subjective",
        title="15040 2025 年 4 月简答论述真题",
        year=2025,
        session="4月",
        filename="xi-1146130-2025年4月自学考试《新中概》真题及答案-回忆版.pdf",
        parser="numbered",
        min_number=26,
        max_number=31,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2025-04-choice",
        title="15044/03709 2025 年 4 月选择题真题",
        year=2025,
        session="4月",
        filename="marx-1146123-2025年4月自考《马原》选择题真题及答案-回忆版.pdf",
        parser="numbered",
        min_number=1,
        max_number=25,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2025-04-subjective",
        title="15044/03709 2025 年 4 月简答论述真题",
        year=2025,
        session="4月",
        filename="marx-1146105-2025年4月自考《马克思主义基本原理》简答题真题及答案-回忆版.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2022-04",
        title="03709/15044 2022 年 4 月简答论述真题",
        year=2022,
        session="4月",
        filename="extracted/marx/marx-2022-04-zip.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2023-04",
        title="03709/15044 2023 年 4 月简答论述真题",
        year=2023,
        session="4月",
        filename="extracted/marx/marx-2023-04-zip.pdf",
        parser="inline_subjective",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2024-04-zip",
        title="03709/15044 2024 年 4 月简答论述真题汇总包版",
        year=2024,
        session="4月",
        filename="extracted/marx/marx-2024-04-zip.pdf",
        parser="inline_subjective",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2025-10-subjective",
        title="15044 2025 年 10 月简答论述真题",
        year=2025,
        session="10月",
        filename="marx-1270153-2025年10月自考《马原》简答、论述真题、答案.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2026-04-subjective",
        title="15044 2026 年 4 月简答论述真题",
        year=2026,
        session="4月",
        filename="marx-1350778-26年4月自考-【马原】真题及答案解析.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="marx",
        paper_id="generated-marx-2024-10-subjective",
        title="03709/15044 2024 年 10 月简答论述真题",
        year=2024,
        session="10月",
        filename="marx-1054639-2024年10月自考《马克思主义基本原理概论》真题及答案.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2024-04",
        title="03708/15043 2024 年 4 月真题答案解析",
        year=2024,
        session="4月",
        filename="history-977235-2024年4月自学考试《中国近现代史纲要》真题及答案解析.pdf",
        parser="answer_delimited",
        min_number=1,
        max_number=33,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2022-04",
        title="03708/15043 2022 年 4 月简答论述真题",
        year=2022,
        session="4月",
        filename="extracted/history/history-2022-04-zip.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2022-10",
        title="03708/15043 2022 年 10 月回忆版简答题",
        year=2022,
        session="10月",
        filename="extracted/history/history-2022-10-zip.pdf",
        parser="inline_subjective",
        min_number=21,
        max_number=24,
        total_score=24,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2023-04",
        title="03708/15043 2023 年 4 月简答论述真题",
        year=2023,
        session="4月",
        filename="extracted/history/history-2023-04-zip.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2024-10-subjective",
        title="03708/15043 2024 年 10 月简答论述真题",
        year=2024,
        session="10月",
        filename="history-1054821-2024年10月自考《中国近现代史纲要》真题及答案解析(回忆版)-.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2025-10-subjective",
        title="15043 2025 年 10 月简答论述真题",
        year=2025,
        session="10月",
        filename="history-1270145-2025年10月自考《中国近现代史纲要》简答、论述真题、答案.pdf",
        parser="numbered",
        min_number=1,
        max_number=8,
        total_score=50,
    ),
    SourceMeta(
        course_id="history",
        paper_id="generated-history-2023-10-subjective",
        title="03708/15043 2023 年 10 月简答论述真题",
        year=2023,
        session="10月",
        filename="history-941572-2023年10月自学考试《中国近现代史纲要》真题及答案考生回忆版.pdf",
        parser="numbered",
        min_number=26,
        max_number=33,
        total_score=50,
    ),
]


ZIP_SPECS = [
    {
        "zip": "marx-1149252-近4年自考《马克思主义基本原理》概论真题及答案汇总(22年-25年).zip",
        "course": "marx",
        "names": [
            "marx-2022-04-zip.pdf",
            "marx-2023-04-zip.pdf",
            "marx-2024-10-zip.pdf",
            "marx-2024-04-zip.pdf",
            "marx-2025-04-subjective-zip.pdf",
            "marx-2025-04-choice-zip.pdf",
        ],
    },
    {
        "zip": "history-1149246-近4年自考《中国近代史纲要》真题及答案解析汇总(22年-25年).zip",
        "course": "history",
        "names": [
            "history-2022-10-zip.pdf",
            "history-2022-04-zip.pdf",
            "history-2023-10-zip.pdf",
            "history-2023-04-zip.pdf",
            "history-2024-10-zip.pdf",
            "history-2024-04-zip.pdf",
            "history-2025-04-zip.pdf",
        ],
    },
]


def extract_known_zips() -> list[dict]:
    extracted: list[dict] = []
    for spec in ZIP_SPECS:
        target_dir = EXTRACTED_DIR / spec["course"]
        target_dir.mkdir(parents=True, exist_ok=True)
        zip_path = RAW_DIR / spec["zip"]
        with zipfile.ZipFile(zip_path) as archive:
            members = [member for member in archive.infolist() if not member.is_dir() and member.filename.lower().endswith(".pdf")]
            members.sort(key=lambda member: member.filename)
            for member, filename in zip(members, spec["names"], strict=True):
                target = target_dir / filename
                target.write_bytes(archive.read(member))
                extracted.append(
                    {
                        "zip": f"raw/{spec['zip']}",
                        "path": str(target.relative_to(ROOT)),
                        "bytes": target.stat().st_size,
                    }
                )
    (ROOT / "index" / "zip-extracted-files.json").write_text(
        json.dumps({"updatedAt": UPDATED_AT, "files": extracted}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return extracted


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"第\s*\d+\s*页\s*共\s*\d+\s*页", "\n", text)
    cleaned: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if re.fullmatch(r"\d{1,3}", line):
            continue
        if "学员专用" in line or "环球网校" in line:
            continue
        if "课程咨询" in line:
            continue
        cleaned.append(line)
    text = "\n".join(cleaned)
    for marker in ["特别说明", "真题估分入口", "各省成绩查询时间", "建议大家提前收藏"]:
        index = text.find(marker)
        if index >= 0:
            text = text[:index]
    text = re.sub(r"([A-H])\s*[．.、,，]\s*", r"\n\1. ", text)
    text = re.sub(r"【答案】\s*[:：]?\s*", r"\n【答案】: ", text)
    text = re.sub(r"(参考答案|答案|答)\s*[:：]\s*", r"\n\1: ", text)
    text = re.sub(r"答》\s*", "\n答: ", text)
    text = re.sub(r"【解析】\s*[:：]?\s*", r"\n解析: ", text)
    text = re.sub(r"解析\s*[:：]\s*", r"\n解析: ", text)
    text = re.sub(r"(?<!\d)(\d{1,2})[、．.,，]\s*", lambda m: f"\n{m.group(1)}. ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf_text(source: SourceMeta) -> str:
    path = source.file_path
    with pdfplumber.open(path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    normalized = normalize_text(text)
    PDF_TEXT_DIR.mkdir(parents=True, exist_ok=True)
    (PDF_TEXT_DIR / f"{source.paper_id}.txt").write_text(normalized + "\n", encoding="utf-8")
    return normalized


def split_numbered_blocks(text: str, min_number: int | None = None, max_number: int | None = None) -> list[tuple[int, str]]:
    matches = [
        match
        for match in re.finditer(r"(?m)^\s*(\d{1,2})[.、．,，]\s+", text)
        if (min_number is None or int(match.group(1)) >= min_number) and (max_number is None or int(match.group(1)) <= max_number)
    ]
    blocks: list[tuple[int, str]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = int(match.group(1))
        body = text[start:end].strip()
        if len(body) > 12:
            blocks.append((number, body))
    return blocks


def answer_delimited_blocks(text: str) -> list[tuple[int, str]]:
    choice_end_match = re.search(r"(?m)^\s*26[.、．]", text)
    choice_text = text[: choice_end_match.start()] if choice_end_match else text
    choice_header = choice_text.find("选择题")
    if choice_header >= 0:
        choice_text = choice_text[choice_header + len("选择题") :]
    blocks: list[tuple[int, str]] = []
    cursor = 0
    number = 1
    for match in re.finditer(r"【答案】\s*[:：]?\s*([A-H])", choice_text):
        block = f"{number}. {choice_text[cursor:match.end()].strip()}"
        if len(block) > 20:
            blocks.append((number, block))
            number += 1
        cursor = match.end()
    blocks.extend(
        (number + offset, block)
        for offset, (_, block) in enumerate(split_numbered_blocks(text[choice_end_match.start() :] if choice_end_match else "", 26, 33))
    )
    return blocks


def find_answer_marker(text: str) -> re.Match[str] | None:
    return re.search(r"【答案】\s*[:：]?\s*|(?:参考答案|答案|答)\s*[:：]\s*", text)


def split_answer_and_analysis(text: str) -> tuple[str, str, str]:
    answer_match = find_answer_marker(text)
    if not answer_match:
        return text, "", ""
    before = text[: answer_match.start()]
    after = text[answer_match.end() :].strip()
    analysis_match = re.search(r"(?:解析|【解析】)\s*[:：]\s*", after)
    if analysis_match:
        answer_raw = after[: analysis_match.start()].strip()
        analysis = after[analysis_match.end() :].strip()
    else:
        answer_raw = after
        analysis = ""
    return before, answer_raw, analysis


OPTION_MARKER = re.compile(r"(?<![A-Za-z])([A-H])\s*[.．、,，]\s*")


def parse_options(front: str) -> tuple[str, list[str]]:
    markers = list(OPTION_MARKER.finditer(front))
    if len(markers) < 2:
        return front.strip(), []
    stem = front[: markers[0].start()].strip()
    options: list[str] = []
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(front)
        option = front[marker.end() : end].strip()
        option = re.sub(r"\s+", " ", option)
        if option:
            options.append(option)
    return stem, options


def split_inline_subjective(front: str) -> tuple[str, str]:
    lines = [line.strip() for line in front.splitlines() if line.strip()]
    if not lines:
        return front.strip(), ""

    first = lines[0]
    rest = "\n".join(lines[1:]).strip()
    first = re.sub(r"^\s*\d{1,2}[.、．,，]\s*", "", first).strip()
    question_mark = re.search(r"[?？]", first)
    if question_mark:
        stem = first[: question_mark.end()].strip()
        trailing = first[question_mark.end() :].strip()
        answer = "\n".join(part for part in [trailing, rest] if part).strip()
        return stem, answer

    if len(lines) > 1:
        return first, rest
    return first, ""


def clean_stem(stem: str) -> str:
    stem = re.sub(r"^\s*\d{1,2}[.、．]\s*", "", stem)
    stem = stem.replace("【题干】", "").replace("[题干]", "")
    stem = re.sub(r"\(?\[?本题\s*[:：]?\s*\d+\s*分\]?\)?", "", stem)
    stem = re.sub(r"（\s*）|\(\s*\)|\[\s*\]", "（ ）", stem)
    stem = re.sub(r"\s+", " ", stem)
    return stem.strip(" ：:。")


def split_text_answer(answer_raw: str) -> list[str]:
    answer_raw = re.sub(r"^[:：]\s*", "", answer_raw.strip())
    parts = re.split(r"\n+|(?=\(\d+\))|(?=（\d+）)|(?=\d+[.、．])|；|;", answer_raw)
    cleaned = []
    for part in parts:
        item = re.sub(r"^[\s\d.、．()（）]+", "", part).strip()
        if len(item) >= 2:
            cleaned.append(item)
    if not cleaned and answer_raw:
        cleaned = [answer_raw]
    return cleaned[:10]


def infer_chapter(course: CourseMeta, stem: str, answer_raw: str) -> str:
    haystack = f"{stem}{answer_raw}".replace(" ", "")
    best_id = next(iter(course.chapters))
    best_score = -1
    for chapter_id, keywords in course.chapters.items():
        score = sum(1 for keyword in keywords if keyword.replace(" ", "") in haystack)
        if score > best_score:
            best_id = chapter_id
            best_score = score
    return best_id


def infer_subjective_type(number: int, stem: str, answer_raw: str) -> str:
    if number >= 31 or re.search(r"论述|试述|结合|分析|为什么说|如何理解|意义", stem):
        return "essay"
    if len(answer_raw) > 260:
        return "essay"
    return "short"


def points_for(question_type: str, number: int, explicit: int | None = None) -> int:
    if explicit:
        return explicit
    if question_type == "single":
        return 2
    if question_type == "multiple":
        return 4
    if question_type == "essay" or number >= 31:
        return 10
    return 6


def parse_explicit_points(text: str) -> int | None:
    match = re.search(r"本题\s*[:：]?\s*(\d+)\s*分|每小题\s*(\d+)\s*分", text)
    if not match:
        return None
    return int(match.group(1) or match.group(2))


def parse_block(course: CourseMeta, source: SourceMeta, number: int, raw_block: str, sequence: int) -> dict | None:
    before_answer, answer_raw, analysis = split_answer_and_analysis(raw_block)
    if source.parser == "inline_subjective" and not answer_raw:
        stem_raw, answer_raw = split_inline_subjective(before_answer)
        options: list[str] = []
    else:
        stem_raw, options = parse_options(before_answer)
    stem = clean_stem(stem_raw)
    if not stem or len(stem) < 4:
        return None

    explicit_points = parse_explicit_points(raw_block)
    answer_letters = re.findall(r"[A-H]", answer_raw.upper())
    if options and answer_letters:
        question_type = "multiple" if len(answer_letters) > 1 else "single"
        answer = sorted(set(answer_letters), key=answer_letters.index)
    elif options:
        question_type = "single"
        answer = ["待补充答案"]
    else:
        question_type = infer_subjective_type(number, stem, answer_raw)
        answer = split_text_answer(answer_raw) or ["待补充答案"]

    question_id = f"{source.paper_id}-q{sequence:03d}"
    points = points_for(question_type, number, explicit_points)
    tags = ["真题", "PDF整理", f"{source.year}{source.session}", course.code]
    if "待补充答案" in answer:
        tags.append("待校对答案")

    return {
        "id": question_id,
        "courseId": course.course_id,
        "paperId": source.paper_id,
        "type": question_type,
        "chapterId": infer_chapter(course, stem, answer_raw),
        "stem": stem,
        **({"options": options} if options else {}),
        "answer": answer,
        "analysis": re.sub(r"\s+", " ", analysis).strip()
        or "本题由本地 PDF 真题整理生成，解析待进一步校对，可结合教材补充页码和易错点。",
        "points": points,
        "difficulty": "较难" if question_type == "essay" else "较易" if question_type == "short" else "易",
        "sourceKind": "imported",
        "tags": tags,
        **({"rubric": answer[:6]} if question_type in {"short", "essay"} else {}),
    }


def parse_source(source: SourceMeta) -> tuple[dict, list[dict], dict]:
    course = COURSES[source.course_id]
    text = extract_pdf_text(source)
    if source.parser == "answer_delimited":
        blocks = answer_delimited_blocks(text)
    else:
        blocks = split_numbered_blocks(text, source.min_number, source.max_number)
    if source.min_number is not None:
        blocks = [(number, block) for number, block in blocks if number >= source.min_number]
    if source.max_number is not None:
        blocks = [(number, block) for number, block in blocks if number <= source.max_number]

    questions: list[dict] = []
    for _, (number, block) in enumerate(blocks, start=1):
        parsed = parse_block(course, source, number, block, len(questions) + 1)
        if parsed:
            questions.append(parsed)

    paper = {
        "id": source.paper_id,
        "courseId": source.course_id,
        "title": source.title,
        "year": source.year,
        "session": source.session,
        "sourceKind": "imported",
        "status": "ready",
        "description": f"由本地 PDF 自动整理生成，来源：materials/past-papers/{source.file_path.relative_to(ROOT)}。部分回忆版题目后续仍需人工校对。",
        "minutes": course.exam_minutes,
        "totalScore": max(sum(question["points"] for question in questions), source.total_score),
        "questionIds": [question["id"] for question in questions],
    }
    stats = {
        "paperId": source.paper_id,
        "source": str(source.file_path.relative_to(ROOT)),
        "questionCount": len(questions),
        "objectiveCount": sum(1 for question in questions if question["type"] in {"single", "multiple"}),
        "textCount": sum(1 for question in questions if question["type"] in {"short", "essay"}),
        "missingAnswerCount": sum(1 for question in questions if question["answer"] == ["待补充答案"]),
    }
    return paper, questions, stats


def is_app_ready(stats: dict) -> bool:
    return stats["questionCount"] > 0 and stats["missingAnswerCount"] == 0


def write_json_bank(
    papers: Iterable[dict],
    questions: Iterable[dict],
    stats: list[dict],
    review_papers: Iterable[dict],
    review_questions: Iterable[dict],
    skipped: list[dict],
) -> None:
    STRUCTURED_DIR.mkdir(parents=True, exist_ok=True)
    bank = {
        "updatedAt": UPDATED_AT,
        "note": "由 materials/past-papers/tools/build-generated-bank.py 从本地 PDF 真题抽取。papers/questions 为已进入应用的可刷题，reviewPapers/reviewQuestions 为待补答案或待校对资料。",
        "papers": list(papers),
        "questions": list(questions),
        "reviewPapers": list(review_papers),
        "reviewQuestions": list(review_questions),
        "skipped": skipped,
        "stats": stats,
    }
    (STRUCTURED_DIR / "generated-import-bank.json").write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ts_literal(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def write_ts_module(papers: list[dict], questions: list[dict]) -> None:
    SRC_OUTPUT.write_text(
        "\n".join(
            [
                "import type { Paper, Question } from '../types'",
                "",
                "// 由 materials/past-papers/tools/build-generated-bank.py 生成。",
                "// 来源是本地已下载 PDF 真题，保留为代码数据是为了让应用打开即可刷题。",
                f"export const generatedPastPapers = {ts_literal(papers)} satisfies Paper[]",
                "",
                f"export const generatedPastQuestions = {ts_literal(questions)} satisfies Question[]",
                "",
            ],
        ),
        encoding="utf-8",
    )


def main() -> None:
    extract_known_zips()
    papers: list[dict] = []
    questions: list[dict] = []
    review_papers: list[dict] = []
    review_questions: list[dict] = []
    skipped: list[dict] = []
    stats: list[dict] = []
    for source in SOURCES:
        paper, parsed_questions, parsed_stats = parse_source(source)
        if parsed_questions and is_app_ready(parsed_stats):
            papers.append(paper)
            questions.extend(parsed_questions)
        elif parsed_questions:
            review_papers.append({**paper, "status": "needs-review"})
            review_questions.extend(parsed_questions)
            skipped.append(
                {
                    "paperId": source.paper_id,
                    "reason": "缺少答案，暂不进入应用刷题入口。",
                    "missingAnswerCount": parsed_stats["missingAnswerCount"],
                    "questionCount": parsed_stats["questionCount"],
                }
            )
        stats.append(parsed_stats)

    write_json_bank(papers, questions, stats, review_papers, review_questions, skipped)
    write_ts_module(papers, questions)
    print(
        json.dumps(
            {
                "papers": len(papers),
                "questions": len(questions),
                "reviewPapers": len(review_papers),
                "reviewQuestions": len(review_questions),
                "skipped": skipped,
                "stats": stats,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
