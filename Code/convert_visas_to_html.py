#!/usr/bin/env python3
"""Convert the CNC cinema visa workbook into a searchable standalone HTML page."""

import argparse
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


NAMESPACE = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DEFAULT_WORKBOOK = (
    Path(__file__).resolve().parents[1]
    / "Data"
    / "Liste_visas_exploitation_cinematographique_CNC_1945-2025.xlsx"
)
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "Data" / "visas.html"


def column_index(cell_reference):
    letters = re.match(r"[A-Z]+", cell_reference).group()
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - ord("A") + 1
    return index - 1


def read_workbook(path):
    with zipfile.ZipFile(path) as workbook:
        shared_strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//main:t", NAMESPACE))
                for item in root.findall("main:si", NAMESPACE)
            ]

        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        rows = sheet.findall(".//main:sheetData/main:row", NAMESPACE)
        if not rows:
            raise ValueError("The workbook's first worksheet is empty.")

        def row_values(row):
            values = {}
            for cell in row.findall("main:c", NAMESPACE):
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    value = "".join(
                        text.text or "" for text in cell.findall(".//main:t", NAMESPACE)
                    )
                else:
                    value_element = cell.find("main:v", NAMESPACE)
                    value = value_element.text if value_element is not None else ""
                    if cell_type == "s" and value:
                        value = shared_strings[int(value)]
                values[column_index(cell.attrib["r"])] = value
            return values

        header_values = row_values(rows[0])
        headers = [header_values[index] for index in range(max(header_values) + 1)]
        records = []
        for row in rows[1:]:
            values = row_values(row)
            if any(values.values()):
                records.append(
                    [values.get(index, "") for index in range(len(headers))]
                )
    return headers, records


def build_html(headers, records):
    payload = json.dumps(
        {"headers": headers, "records": records}, ensure_ascii=False, separators=(",", ":")
    )
    payload = payload.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    header_html = "".join(f"<th scope=\"col\">{header}</th>" for header in headers)
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Base des visas d'exploitation cinématographique délivrés par le CNC de 1945 à 2025.">
  <title>Visas d'exploitation cinématographique — CNC</title>
  <style>
    :root {{ color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #172033; background: #f4f6fa; }}
    body {{ margin: 0; }}
    main {{ max-width: 1440px; margin: 0 auto; padding: 2rem clamp(1rem, 4vw, 3rem); }}
    h1 {{ margin-bottom: .4rem; font-size: clamp(1.6rem, 3vw, 2.3rem); }}
    .intro, #result-count {{ color: #536078; }}
    .controls {{ display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin: 1.5rem 0 1rem; }}
    input {{ box-sizing: border-box; width: min(100%, 34rem); padding: .8rem 1rem; border: 1px solid #aeb8c9; border-radius: .5rem; font: inherit; }}
    input:focus, button:focus-visible {{ outline: 3px solid #83aaff; outline-offset: 2px; }}
    .table-wrap {{ overflow: auto; max-height: 70vh; border: 1px solid #d5dbe5; border-radius: .65rem; background: white; }}
    table {{ width: 100%; border-collapse: collapse; text-align: left; }}
    th, td {{ padding: .7rem .8rem; border-bottom: 1px solid #e6eaf0; vertical-align: top; }}
    th {{ position: sticky; top: 0; z-index: 1; background: #eaf0fa; white-space: nowrap; }}
    tbody tr:nth-child(even) {{ background: #f8f9fc; }}
    .pagination {{ display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-top: 1rem; }}
    button {{ padding: .55rem .9rem; border: 1px solid #aeb8c9; border-radius: .4rem; background: white; font: inherit; cursor: pointer; }}
    button:disabled {{ cursor: not-allowed; opacity: .5; }}
    @media (prefers-reduced-motion: no-preference) {{ button {{ transition: background-color .15s ease; }} button:hover:not(:disabled) {{ background: #edf2fb; }} }}
  </style>
</head>
<body>
<main>
  <h1>Visas d'exploitation cinématographique</h1>
  <p class="intro">Visas délivrés par le Centre national du cinéma et de l'image animée (CNC), de 1945 à 2025.</p>
  <div class="controls">
    <label for="search">Rechercher dans les données</label>
    <input id="search" type="search" placeholder="Titre, réalisateur, année, nationalité…">
    <span id="result-count" aria-live="polite"></span>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>{header_html}</tr></thead>
      <tbody id="results"></tbody>
    </table>
  </div>
  <nav class="pagination" aria-label="Pagination">
    <button id="previous" type="button">Précédent</button>
    <span id="page-status" aria-live="polite"></span>
    <button id="next" type="button">Suivant</button>
  </nav>
</main>
<script id="dataset" type="application/json">{payload}</script>
<script>
  const records = JSON.parse(document.getElementById("dataset").textContent).records;
  const pageSize = 50;
  let page = 0;
  let filteredRecords = records;
  const search = document.getElementById("search");
  const results = document.getElementById("results");
  const resultCount = document.getElementById("result-count");
  const pageStatus = document.getElementById("page-status");
  const previous = document.getElementById("previous");
  const next = document.getElementById("next");

  function render() {{
    const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    page = Math.min(page, pageCount - 1);
    const start = page * pageSize;
    const fragment = document.createDocumentFragment();
    for (const record of filteredRecords.slice(start, start + pageSize)) {{
      const row = document.createElement("tr");
      for (const value of record) {{
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }}
      fragment.appendChild(row);
    }}
    results.replaceChildren(fragment);
    resultCount.textContent = `${{filteredRecords.length.toLocaleString("fr-FR")}} résultat(s) sur ${{records.length.toLocaleString("fr-FR")}}`;
    pageStatus.textContent = `Page ${{page + 1}} sur ${{pageCount}}`;
    previous.disabled = page === 0;
    next.disabled = page >= pageCount - 1;
  }}

  search.addEventListener("input", () => {{
    const query = search.value.trim().toLocaleLowerCase("fr");
    filteredRecords = query
      ? records.filter(record => record.some(value => String(value).toLocaleLowerCase("fr").includes(query)))
      : records;
    page = 0;
    render();
  }});
  previous.addEventListener("click", () => {{ page--; render(); }});
  next.addEventListener("click", () => {{ page++; render(); }});
  render();
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_WORKBOOK, help="Excel workbook")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="HTML output file")
    args = parser.parse_args()

    headers, records = read_workbook(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(headers, records), encoding="utf-8")
    print(f"Generated {args.output} with {len(records):,} records.")


if __name__ == "__main__":
    main()
