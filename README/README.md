# Jito html2json Test Task

## Overview

This repository contains a custom `html2json(htmlText)` implementation. It converts an HTML string into a JSON tree without using `DOMParser`, `document`, `innerHTML`, or any third-party DOM/HTML parser.

The parser is intentionally written as a small, dependency-free, best-effort parser. Its main goal is to be robust: unexpected or imperfect input should not crash the function.

## Output structure

The function always returns a root wrapper:

```js
{
  type: "root",
  children: []
}
```

Element nodes have this shape:

```js
{
  type: "element",
  tag: "div",
  attributes: {
    class: "card",
    disabled: true
  },
  children: []
}
```

Text nodes have this shape:

```js
{
  type: "text",
  content: "Hello"
}
```

A root wrapper is used because valid HTML input can contain several top-level nodes, for example:

```html
<h1>Title</h1>
<p>Description</p>
```

## Supported cases

- Nested HTML elements
- Multiple root-level elements
- Standard attributes with double quotes, single quotes, or unquoted values
- Boolean attributes such as `disabled`, `checked`, and `hidden`
- Void tags such as `br`, `hr`, `img`, `input`, `meta`, and `link`
- Self-closing syntax such as `<hr />`
- HTML comments and declarations such as `<!DOCTYPE html>` are skipped
- Raw text elements: `script`, `style`, `textarea`, and `title`
- Common HTML entities such as `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`, `&copy;`
- Numeric entities such as `&#169;` and `&#xA9;`

- If a closing tag does not match any currently open element,
  it is ignored. This keeps the parser from crashing and preserves
  the already parsed tree.
  
## Robustness decisions

The function does not throw on malformed or surprising input. If closing tags are mismatched, it closes the nearest matching element in the internal stack and continues. If a tag cannot be parsed safely, the parser treats it as text or skips the problematic declaration.

This is a practical compromise for the assignment: the goal is not to fully reproduce browser-grade HTML parsing, but to provide a clean and stable conversion function.

## Files

```txt
html2json.js
index.html
README.md
html_samples/
  simple.html
  nested.html
  attributes.html
  void-tags.html
  raw-text-and-comments.html
  edge-cases.html
ai_help/
  chatgpt_chat.txt
```

## How to run manually in browser

Open `index.html` in a browser, paste HTML into the left textarea, and click **Convert to JSON**.

## How to test with Node.js

From the repository root:

```bash
node - <<'NODE'
const fs = require("fs");
const path = require("path");
const { html2json } = require("./html2json");

for (const file of fs.readdirSync("./html_samples")) {
  const html = fs.readFileSync(path.join("./html_samples", file), "utf8");
  const json = html2json(html);
  console.log(file, JSON.stringify(json).length);
}
NODE
```

The command should finish without crashing on all files in `html_samples`.

## AI usage

AI assistance was used during implementation. The required conversation link should be added to:

```txt
ai_help/chatgpt_chat.txt
```

Before submitting, replace the placeholder in that file with a public ChatGPT share link and verify that the link opens in incognito mode.
