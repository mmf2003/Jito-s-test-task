function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");

  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

/*
  Converts an HTML string into a JSON tree without using:
  - DOMParser
  - document.createElement
  - innerHTML
  - third-party parser libraries

  Output format:
  {
    type: "root",
    children: [
      {
        type: "element",
        tag: "div",
        attributes: {},
        children: [
          {
            type: "text",
            content: "Hello"
          }
        ]
      }
    ]
  }
*/

function html2json(htmlText) {
  const input =
    typeof htmlText === "string"
      ? htmlText
      : String(htmlText ?? "");

  const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  const RAW_TEXT_TAGS = new Set([
    "script",
    "style",
    "textarea",
    "title",
  ]);

  const PRESERVE_WHITESPACE_TAGS = new Set([
    "pre",
    "textarea",
    "script",
    "style",
  ]);

  const root = {
    type: "root",
    children: [],
  };

  const stack = [root];

  let position = 0;

  while (position < input.length) {
    const nextTagStart = input.indexOf("<", position);

    // No more tags
    if (nextTagStart === -1) {
      appendText(input.slice(position));
      break;
    }

    // Text before tag
    if (nextTagStart > position) {
      appendText(
        input.slice(position, nextTagStart)
      );
    }

    // HTML comments
    if (input.startsWith("<!--", nextTagStart)) {
      const commentEnd = input.indexOf(
        "-->",
        nextTagStart + 4
      );

      position =
        commentEnd === -1
          ? input.length
          : commentEnd + 3;

      continue;
    }

    // CDATA
    if (input.startsWith("<![CDATA[", nextTagStart)) {
      const cdataEnd = input.indexOf(
        "]]>",
        nextTagStart + 9
      );

      const cdataText =
        cdataEnd === -1
          ? input.slice(nextTagStart + 9)
          : input.slice(
              nextTagStart + 9,
              cdataEnd
            );

      appendText(cdataText, {
        preserveWhitespace: true,
      });

      position =
        cdataEnd === -1
          ? input.length
          : cdataEnd + 3;

      continue;
    }

    // <!DOCTYPE ...>
    if (input.startsWith("<!", nextTagStart)) {
      const declarationEnd = findTagEnd(
        input,
        nextTagStart + 2
      );

      position =
        declarationEnd === -1
          ? input.length
          : declarationEnd + 1;

      continue;
    }

    // <?xml ... ?>
    if (input.startsWith("<?", nextTagStart)) {
      const instructionEnd = input.indexOf(
        "?>",
        nextTagStart + 2
      );

      position =
        instructionEnd === -1
          ? input.length
          : instructionEnd + 2;

      continue;
    }

    const tagEnd = findTagEnd(
      input,
      nextTagStart + 1
    );

    // Broken tag
    if (tagEnd === -1) {
      appendText(input.slice(nextTagStart));
      break;
    }

    const rawTagContent = input
      .slice(nextTagStart + 1, tagEnd)
      .trim();

    // Empty tag <>
    if (!rawTagContent) {
      appendText(
        input.slice(nextTagStart, tagEnd + 1)
      );

      position = tagEnd + 1;
      continue;
    }

    // Closing tag
    if (rawTagContent[0] === "/") {
      const closingTagName = readTagName(
        rawTagContent.slice(1)
      ).toLowerCase();

      if (closingTagName) {
        closeElement(closingTagName);
      }

      position = tagEnd + 1;
      continue;
    }

    // Opening tag
    const parsedTag = parseOpeningTag(
      rawTagContent
    );

    // Invalid tag
    if (!parsedTag) {
      appendText(
        input.slice(nextTagStart, tagEnd + 1)
      );

      position = tagEnd + 1;
      continue;
    }

    const element = {
      type: "element",
      tag: parsedTag.tagName,
      attributes: parsedTag.attributes,
      children: [],
    };

    currentParent().children.push(element);

    const isVoid = VOID_TAGS.has(
      parsedTag.tagName
    );

    const isSelfClosing =
      parsedTag.selfClosing || isVoid;

    position = tagEnd + 1;

    if (!isSelfClosing) {
      stack.push(element);

      if (
        RAW_TEXT_TAGS.has(parsedTag.tagName)
      ) {
        position = consumeRawTextContent(
          parsedTag.tagName,
          position
        );
      }
    }
  }

  return root;

  function currentParent() {
    return stack[stack.length - 1];
  }

  function appendText(text, options = {}) {
    if (!text) {
      return;
    }

    const parent = currentParent();

    const preserveWhitespace =
      Boolean(options.preserveWhitespace) ||
      PRESERVE_WHITESPACE_TAGS.has(parent.tag);

    let content = decodeHtmlEntities(text);

    // Normalize regular HTML whitespace
    if (!preserveWhitespace) {
      content = content
        .replace(/\s+/g, " ")
        .trim();
    }

    if (content === "") {
      return;
    }

    const lastChild =
      parent.children[parent.children.length - 1];

    // Merge neighboring text nodes
    if (
      lastChild &&
      lastChild.type === "text"
    ) {
      lastChild.content += content;
      return;
    }

    parent.children.push({
      type: "text",
      content,
    });
  }

  function closeElement(tagName) {
    const normalizedTagName =
      tagName.toLowerCase();

    for (
      let index = stack.length - 1;
      index > 0;
      index -= 1
    ) {
      if (
        stack[index].tag ===
        normalizedTagName
      ) {
        // Remove matched element
        // and implicitly closed children
        stack.length = index;
        return;
      }
    }

    // Unknown closing tag is ignored intentionally
  }

  function consumeRawTextContent(
    tagName,
    startPosition
  ) {
    const closeTagPattern = new RegExp(
      `</\\s*${escapeRegExp(
        tagName
      )}\\s*>`,
      "i"
    );

    const remaining =
      input.slice(startPosition);

    const closeMatch =
      remaining.match(closeTagPattern);

    // Unclosed raw-text tag
    if (
      !closeMatch ||
      closeMatch.index === undefined
    ) {
      const rawText =
        input.slice(startPosition);

      appendText(rawText, {
        preserveWhitespace: true,
      });

      stack.pop();

      return input.length;
    }

    const rawText = remaining.slice(
      0,
      closeMatch.index
    );

    appendText(rawText, {
      preserveWhitespace: true,
    });

    stack.pop();

    return (
      startPosition +
      closeMatch.index +
      closeMatch[0].length
    );
  }
}

function findTagEnd(input, startPosition) {
  let quote = null;

  for (
    let index = startPosition;
    index < input.length;
    index += 1
  ) {
    const char = input[index];

    // Inside quotes
    if (quote) {
      if (char === quote) {
        quote = null;
      }

      continue;
    }

    // Opening quote
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    // Tag end
    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function parseOpeningTag(tagContent) {
  const trimmed = tagContent.trim();

  const tagName = readTagName(
    trimmed
  ).toLowerCase();

  // Invalid tag name
  if (
    !tagName ||
    !/^[a-zA-Z][a-zA-Z0-9:-]*$/.test(
      tagName
    )
  ) {
    return null;
  }

  let rest = trimmed
    .slice(tagName.length)
    .trim();

  let selfClosing = false;

  // <img />
  if (rest.endsWith("/")) {
    selfClosing = true;
    rest = rest.slice(0, -1).trim();
  }

  return {
    tagName,
    attributes: parseAttributes(rest),
    selfClosing,
  };
}

function readTagName(value) {
  const match = String(value)
    .trim()
    .match(/^([a-zA-Z][a-zA-Z0-9:-]*)/);

  return match ? match[1] : "";
}

function parseAttributes(attributesText) {
  const attributes = {};

  let index = 0;

  while (index < attributesText.length) {
    // Skip spaces
    while (
      index < attributesText.length &&
      /\s/.test(attributesText[index])
    ) {
      index += 1;
    }

    if (index >= attributesText.length) {
      break;
    }

    const nameStart = index;

    // Read attribute name
    while (
      index < attributesText.length &&
      !/[\s=/>]/.test(
        attributesText[index]
      )
    ) {
      index += 1;
    }

    const rawName =
      attributesText.slice(
        nameStart,
        index
      );

    if (!rawName) {
      index += 1;
      continue;
    }

    const attributeName =
      rawName.toLowerCase();

    while (
      index < attributesText.length &&
      /\s/.test(attributesText[index])
    ) {
      index += 1;
    }

    // Boolean attribute
    if (attributesText[index] !== "=") {
      attributes[attributeName] = true;
      continue;
    }

    index += 1;

    while (
      index < attributesText.length &&
      /\s/.test(attributesText[index])
    ) {
      index += 1;
    }

    // Empty value
    if (index >= attributesText.length) {
      attributes[attributeName] = "";
      break;
    }

    const quote =
      attributesText[index];

    let value = "";

    // Quoted value
    if (quote === '"' || quote === "'") {
      index += 1;

      const valueStart = index;

      while (
        index < attributesText.length &&
        attributesText[index] !== quote
      ) {
        index += 1;
      }

      value = attributesText.slice(
        valueStart,
        index
      );

      if (
        attributesText[index] === quote
      ) {
        index += 1;
      }
    } else {
      // Unquoted value
      const valueStart = index;

      while (
        index < attributesText.length &&
        !/[\s>]/.test(
          attributesText[index]
        )
      ) {
        index += 1;
      }

      value = attributesText.slice(
        valueStart,
        index
      );
    }

    value = decodeHtmlEntities(value)
      .replace(/\s+/g, " ")
      .trim();

    attributes[attributeName] = value;
  }

  return attributes;
}

function decodeHtmlEntities(value) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00A0",
    copy: "©",
    reg: "®",
    trade: "™",
  };

  return String(value).replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (match, entity) => {
      // Numeric entity
      if (entity[0] === "#") {
        const isHex =
          entity[1] &&
          entity[1].toLowerCase() === "x";

        const codePoint = parseInt(
          entity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );

        if (Number.isFinite(codePoint)) {
          try {
            return String.fromCodePoint(
              codePoint
            );
          } catch (error) {
            return match;
          }
        }

        return match;
      }

      return Object.prototype.hasOwnProperty.call(
        entities,
        entity
      )
        ? entities[entity]
        : match;
    }
  );
}

function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>`;

  const jsonContent = html2json(htmlExample);

  document.getElementById("html").value =
    htmlExample;

  document.getElementById(
    "json"
  ).textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
<button>Click me!</button>
<textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>`;

  const jsonContent = html2json(htmlExample);

  document.getElementById("html").value =
    htmlExample;

  document.getElementById(
    "json"
  ).textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    html2json,
    parseAttributes,
    decodeHtmlEntities,
  };
}