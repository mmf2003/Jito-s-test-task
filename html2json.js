function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}


function html2json(htmlText) {
    const input =
        typeof htmlText === "string" ? htmlText : String(htmlText ?? "");

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

    const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

    const root = {
        type: "root",
        children: [],
    };

    const stack = [root];
    let position = 0;

    while (position < input.length) {
        const nextTagStart = input.indexOf("<", position);

        if (nextTagStart === -1) {
            appendText(input.slice(position));
            break;
        }

        if (nextTagStart > position) {
            appendText(input.slice(position, nextTagStart));
        }

        if (input.startsWith("<!--", nextTagStart)) {
            const commentEnd = input.indexOf("-->", nextTagStart + 4);
            position = commentEnd === -1 ? input.length : commentEnd + 3;
            continue;
        }

        if (input.startsWith("<![CDATA[", nextTagStart)) {
            const cdataEnd = input.indexOf("]]>", nextTagStart + 9);
            const cdataText =
                cdataEnd === -1
                ? input.slice(nextTagStart + 9)
                : input.slice(nextTagStart + 9, cdataEnd);
            appendText(cdataText, { preserveWhitespace: true });
            position = cdataEnd === -1 ? input.length : cdataEnd + 3;
            continue;
        }

        if (input.startsWith("<!", nextTagStart)) {
            const declarationEnd = findTagEnd(input, nextTagStart + 2);
            position = declarationEnd === -1 ? input.length : declarationEnd + 1;
            continue;
        }

        if (input.startsWith("<?", nextTagStart)) {
            const instructionEnd = input.indexOf("?>", nextTagStart + 2);
            position = instructionEnd === -1 ? input.length : instructionEnd + 2;
            continue;
        }

        const tagEnd = findTagEnd(input, nextTagStart + 1);

        if (tagEnd === -1) {
            appendText(input.slice(nextTagStart));
            break;
        }

        const rawTagContent = input.slice(nextTagStart + 1, tagEnd).trim();

        if (!rawTagContent) {
            appendText(input.slice(nextTagStart, tagEnd + 1));
            position = tagEnd + 1;
            continue;
        }

        if (rawTagContent[0] === "/") {
            const closingTagName = readTagName(rawTagContent.slice(1)).toLowerCase();

            if (closingTagName) {
                closeElement(closingTagName);
            }

            position = tagEnd + 1;
            continue;
        }

        const parsedTag = parseOpeningTag(rawTagContent);

        if (!parsedTag) {
            appendText(input.slice(nextTagStart, tagEnd + 1));
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

        const isVoid = VOID_TAGS.has(parsedTag.tagName);
        const isSelfClosing = parsedTag.selfClosing || isVoid;

        position = tagEnd + 1;

        if (!isSelfClosing) {
            stack.push(element);

            if (RAW_TEXT_TAGS.has(parsedTag.tagName)) {
                position = consumeRawTextContent(parsedTag.tagName, position);
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

        const preserveWhitespace = Boolean(options.preserveWhitespace);
        const content = decodeHtmlEntities(text);

        if (!preserveWhitespace && content.trim() === "") {
            return;
        }

        currentParent().children.push({
            type: "text",
            content,
        });
    }

    function closeElement(tagName) {
        const normalizedTagName = tagName.toLowerCase();

        for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === normalizedTagName) {
            stack.length = index;
            return;
            }
        }

    // Unknown closing tag is ignored intentionally.
    }

    function consumeRawTextContent(tagName, startPosition) {

        const closeTagPattern = new RegExp(
        `</\\s*${escapeRegExp(tagName)}\\s*>`,
        "i",
        );
        const remaining = input.slice(startPosition);
        const closeMatch = remaining.match(closeTagPattern);

        if (!closeMatch || closeMatch.index === undefined) {
            const rawText = input.slice(startPosition);
            appendText(rawText, { preserveWhitespace: true });
            stack.pop();
            return input.length;
        }

        const rawText = remaining.slice(0, closeMatch.index);
        appendText(rawText, { preserveWhitespace: true });
        stack.pop();

        return startPosition + closeMatch.index + closeMatch[0].length;
    }
}

function findTagEnd(input, startPosition) {
    let quote = null;

    for (let index = startPosition; index < input.length; index += 1) {
        const char = input[index];

        if (quote) {
        if (char === quote) {
            quote = null;
        }
        continue;
        }

        if (char === '"' || char === "'") {
        quote = char;
        continue;
        }

        if (char === ">") {
        return index;
        }
    }

  return -1;
}

function parseOpeningTag(tagContent) {
    const trimmed = tagContent.trim();
    const tagName = readTagName(trimmed).toLowerCase();

    if (!tagName || !/^[a-zA-Z][a-zA-Z0-9:-]*$/.test(tagName)) {
        return null;
    }

    let rest = trimmed.slice(tagName.length).trim();
    let selfClosing = false;

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
        while (index < attributesText.length && /\s/.test(attributesText[index])) {
        index += 1;
        }

        if (index >= attributesText.length) {
        break;
        }

        const nameStart = index;

        while (
        index < attributesText.length &&
        !/[\s=/>]/.test(attributesText[index])
        ) {
        index += 1;
        }

        const rawName = attributesText.slice(nameStart, index);

        if (!rawName) {
        index += 1;
        continue;
        }

        const attributeName = rawName.toLowerCase();

        while (index < attributesText.length && /\s/.test(attributesText[index])) {
        index += 1;
        }

        if (attributesText[index] !== "=") {
        attributes[attributeName] = true;
        continue;
        }

        index += 1;

        while (index < attributesText.length && /\s/.test(attributesText[index])) {
        index += 1;
        }

        if (index >= attributesText.length) {
        attributes[attributeName] = "";
        break;
        }

        const quote = attributesText[index];
        let value = "";

        if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;

        while (index < attributesText.length && attributesText[index] !== quote) {
            index += 1;
        }

        value = attributesText.slice(valueStart, index);

        if (attributesText[index] === quote) {
            index += 1;
        }
        } else {
        const valueStart = index;

            while (
                index < attributesText.length &&
                !/[\s>]/.test(attributesText[index])
            ) {
                index += 1;
            }

            value = attributesText.slice(valueStart, index);
        }

        attributes[attributeName] = decodeHtmlEntities(value);
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
        if (entity[0] === "#") {
            const isHex = entity[1] && entity[1].toLowerCase() === "x";
            const codePoint = parseInt(
            entity.slice(isHex ? 2 : 1),
            isHex ? 16 : 10,
            );

            if (Number.isFinite(codePoint)) {
            try {
                return String.fromCodePoint(codePoint);
            } catch (error) {
                return match;
            }
            }

            return match;
        }

        return Object.prototype.hasOwnProperty.call(entities, entity)
            ? entities[entity]
            : match;
        },
    );
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    </html>
    `;
    const jsonContent = html2json(htmlExample);

    document.getElementById("html").value = htmlExample;
    document.getElementById("json").textContent = JSON.stringify(
        jsonContent,
        null,
        2,
    );
}

function showExample2() {
    const htmlExample = `<div>
    <p>Hello world!</p>
    <button>Click me!</button>
    <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
    </div>
    `;
    const jsonContent = html2json(htmlExample);

    document.getElementById("html").value = htmlExample;
    document.getElementById("json").textContent = JSON.stringify(
        jsonContent,
        null,
        2,
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        html2json,
        parseAttributes,
        decodeHtmlEntities,
    };
}
