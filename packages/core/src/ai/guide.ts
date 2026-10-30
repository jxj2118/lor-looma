export const LOOMA_AI_GUIDE = `
## What Looma is

A Looma document is a sequence of cards. In \`presentation\` format each card is one 16:9 slide with a logical size of 1280×720. In \`document\` format each card is one long-form page. Inside a card, layout containers arrange content blocks. You read and change the document only through the tools \`looma_get_outline\`, \`looma_get_cards\`, and \`looma_apply\`. Do not write a JSON file yourself unless the host explicitly asks you to generate the whole document in one shot.

## Workflow

Call \`looma_get_outline\` first. It returns the title, the format, and every card id, title, and a short preview of each block and container (id, type, depth). Those ids are what later commands address.

Before you edit, call \`looma_get_cards\` with \`as\` set to \`"json"\` and read the exact fields. \`as: "markdown"\` is a readable view: every node is preceded by an \`<!-- id: ... -->\` comment. Markdown is read-only. Never write it back.

Put one intention into a single \`looma_apply\` batch. The batch is atomic: if any command fails, nothing changes, and that call is not an undo step. Each successful call is one undo step, so do not split one intention across calls. On failure, read \`error\`, fix the command, and send the whole batch again. On success, use the returned \`outline\` for the next step instead of calling \`looma_get_outline\` again.

## Document model

A card has \`body\` (the ordered nodes), and optionally \`accent\`, \`background\`, and \`notes\`. \`notes\` is the speaker script, not text on the slide. \`accent\` is \`{ "position": "left" | "right" | "top" | "background", "assetId" }\`. \`background\` is one of \`{ "kind": "color", "value" }\`, \`{ "kind": "gradient", "from", "to", "angle" }\` (\`angle\` defaults to 135 and must be from 0 to 360), or \`{ "kind": "image", "assetId" }\`. Color fields are CSS colors: \`#rgb\`, \`#rrggbb\`, \`rgb(r, g, b)\`, or \`hsl(h, s%, l%)\`.

The nine blocks:

- \`heading\`: \`level\` is 1, 2, or 3, plus \`text\`.
- \`paragraph\`: \`text\`, and optional \`align\` of \`left\`, \`center\`, or \`right\`.
- \`list\`: \`style\` is \`bullet\` (the default), \`number\`, or \`check\`, plus \`items\`. An item is a string or \`{ "text", "checked"?, "children"? }\`. \`checked\` is for \`check\` lists. \`children\` uses the same item shape. Lists nest at most 3 levels.
- \`image\`: required \`assetId\`, optional \`fit\` of \`cover\` or \`contain\`, optional \`caption\`, optional \`width\` of \`auto\` or \`full\`.
- \`table\`: \`rows\` is an array of arrays of inline strings, at least one row, and every row has the same number of cells. \`header\` is a boolean and defaults to false.
- \`callout\`: \`tone\` is \`info\` (the default), \`success\`, \`warning\`, \`danger\`, or \`note\`, plus \`text\`.
- \`quote\`: \`text\`, and optional \`cite\`.
- \`divider\`: no fields besides \`type\`.
- \`code\`: \`code\` is literal plain text, not inline markup. Optional \`language\` is at most 32 characters.

The three containers:

- \`stack\`: optional \`gap\` of \`none\`, \`sm\`, \`md\`, or \`lg\`, and \`children\` as a flat list of nodes.
- \`columns\`: \`widths\` is 2 to 4 positive numbers, and \`children\` is one array of nodes per column. \`widths\` and \`children\` must have the same length. Optional \`gap\` uses the same names as stack. Optional \`align\` is \`start\`, \`center\`, \`end\`, or \`stretch\`.
- \`grid\`: \`columns\` is 2, 3, or 4 and defaults to 2. Optional \`gap\`. \`children\` is a flat list of nodes.

A card body is depth 0. Containers may appear at depth 0 and depth 1 only, so the nesting limit is 2 container levels. The third level holds blocks only. A \`columns\` container inside a \`stack\` is already the second level; its cells must hold blocks, not another container.

An image block, a card \`accent\`, or a \`background\` of kind \`image\` must refer to an asset id that exists. Add the asset with \`putAsset\` first. Doing that earlier in the same batch is enough. An asset \`src\` must start with \`http://\`, \`https://\`, or \`data:image/\`.

The document also has \`title\`, \`format\` (\`presentation\` or \`document\`; switching keeps the content), and \`theme\`. \`theme.preset\` is \`clean\`, \`dark\`, \`warm\`, or \`serif\`. \`theme.overrides\` may set \`colorBg\`, \`colorFg\`, \`colorMuted\`, \`colorPrimary\`, \`colorAccent\`, \`colorInfo\`, \`colorSuccess\`, \`colorWarning\`, \`colorDanger\`, \`colorNote\`, and \`cardBackground\` (CSS colors); \`fontHeading\`, \`fontBody\`, and \`fontMono\` (\`system\`, \`sans\`, \`serif\`, \`rounded\`, or \`mono\`); \`fontScale\` from 0.8 to 1.4; \`radius\` as an integer from 0 to 32; and \`spacing\` from 0.75 to 1.5. Set an override to \`null\` to remove it. \`setTheme\` needs a preset, overrides, or both.

## Ids and locations

Omit \`id\` on cards and nodes you are creating. The success result lists every new id in \`createdIds\`, in creation order, parent before children. Use those ids in the next batch. If a later command in the same batch must point at a node you are creating now, choose the id yourself. An id starts with a letter and then has only letters, digits, \`_\`, or \`-\`, with at most 64 characters. Generated ids use the prefixes \`doc_\`, \`c_\`, \`n_\`, \`b_\`, and \`img_\`. A chosen id must not already be in use.

A node location is exactly one of these:

- \`{ "before": "b_lead" }\` inserts as the previous sibling of that node.
- \`{ "after": "b_lead" }\` inserts as the next sibling.
- \`{ "parent": "c_title" }\` appends to that card's body. Add \`"index"\` to choose the position, starting at 0.
- \`{ "parent": "n_process_columns", "slot": 0, "index": 1 }\` targets one column. \`slot\` is required when the parent is \`columns\`, and forbidden on a card, stack, or grid.

\`before\` and \`after\` must name a node, never a card. To place a node at the top level of a card, use \`{ "parent": "<cardId>" }\`.

A card location is \`{ "before": "c_process" }\`, \`{ "after": "c_title" }\`, or \`{ "index": 0 }\`. Omit \`at\` on \`insertCard\` to append the card.

## Inline text

Inline fields (\`text\`, \`caption\`, \`cite\`, list items, and table cells) accept a small markup, and nothing else:

- \`**bold**\`, \`*italic*\`, and \`~~strike~~\`.
- Inline code: a span wrapped in single backticks.
- Links: \`[label](https://example.com)\`. The href must be \`http\`, \`https\`, or \`mailto\`.
- Color: \`{color:name}...{/color}\`. The names are primary, accent, muted, info, success, warning, danger, red, orange, yellow, green, blue, purple, pink, and gray.
- Highlight: \`{highlight:name}...{/highlight}\`. The names are yellow, green, blue, pink, purple, orange, red, and gray.
- A single newline \`\\n\` is a line break. A blank line \`\\n\\n\` is allowed only in \`callout\` and \`quote\`, where it starts another paragraph. Other blocks keep one paragraph.
- To show a literal \`*\`, \`~\`, backtick, \`[\`, \`]\`, \`(\`, \`)\`, \`{\`, or \`}\`, escape it with a backslash.

Do not use HTML. Do not use image markup. Do not use block Markdown: no \`#\` headings, no \`- \` or \`>\` prefixes, and no Markdown tables. Those are blocks (\`heading\`, \`list\`, \`quote\`, \`table\`, \`image\`), not characters inside \`text\`.

## Writing good slides

In \`presentation\`, give each card one main idea. A title plus about six bullets, or two or three short paragraphs, is enough. If there is more to say, add another card. The viewer reports cards that overflow the 1280×720 frame, and the host may pass those ids back to you. Split an overflowing card instead of shrinking the copy.

Use \`columns\` for a comparison, \`grid\` for three to six peer ideas, and \`callout\` for the sentence the room should remember. Put the spoken script in \`notes\`, not in the body. Do not give every card the same layout.

## Writing good documents

In \`document\`, organize with \`heading\` levels. Use level 1 only for the document title, then level 2 and level 3 for sections. Paragraphs can be longer than on a slide. Put structured data in a \`table\` with \`header: true\`. A side-by-side comparison can still use \`columns\`, but most of a document is one vertical flow.

## Command reference

Each line is the op, the fields a successful call must include, and what it does. Target ids (the existing card or node) are required. Ids of things you are creating are optional.

- \`setTitle\` — required: \`title\`. Set the document title.
- \`setFormat\` — required: \`format\` (\`presentation\` or \`document\`). Switch between presentation (16:9 cards) and document (long-form pages). Content is kept.
- \`setTheme\` — required: \`preset\`, \`overrides\`, or both. Change the theme preset and/or override theme variables. An override set to null is removed.
- \`putAsset\` — required: \`asset\` (\`kind: "image"\` and \`src\`). Add or replace an image asset. Omit id to create a new one; the new id is returned in \`createdIds\`.
- \`removeAsset\` — required: \`id\`. Remove an asset that is no longer referenced by any card or block.
- \`insertCard\` — required: nothing; \`card\` and \`at\` are optional. Insert a new card (slide or page). Omit ids to have them generated. Defaults to the end of the document.
- \`updateCard\` — required: \`id\`, \`patch\` with at least one of \`accent\`, \`background\`, \`notes\`. Change a card's accent image, background, or speaker notes. null removes a field.
- \`moveCard\` — required: \`id\`, \`to\`. Move a card to another position.
- \`duplicateCard\` — required: \`id\`; optional \`newId\` for the copy's card id. Copy a card and all its content right after the original, with new ids.
- \`deleteCard\` — required: \`id\`. Delete a card and everything in it.
- \`insertNode\` — required: \`node\`, \`at\`. Insert a block or layout container at a location.
- \`updateNode\` — required: \`id\`, \`patch\` with at least one field. Change some fields of an existing block or container (shallow merge). null removes an optional field. The patch cannot contain \`id\`, \`type\`, or \`children\`.
- \`replaceNode\` — required: \`id\`, \`node\`. Replace a node with a different one (may change its type). Keeps the old id unless the new node sets one.
- \`moveNode\` — required: \`id\`, \`to\`. Move a node to another location, possibly in another card.
- \`deleteNode\` — required: \`id\`. Delete a block or container (and its children).
- \`wrapNodes\` — required: \`ids\` (one or more adjacent siblings), \`container\`. Wrap adjacent sibling nodes in a new stack, columns, or grid container. For columns, each node becomes one column, so provide one width per node.
- \`unwrapNode\` — required: \`id\`. Remove a container and put its children in its place.
- \`insertColumn\` — required: \`id\` of a \`columns\` container; optional \`index\` and \`width\`. Add an empty column to a columns container (max 4).
- \`deleteColumn\` — required: \`id\`, \`index\`; optional \`moveNodesTo\`. Remove a column from a columns container (min 2). Its nodes are deleted unless \`moveNodesTo\` is given. If only two columns remain, use \`unwrapNode\` instead.

## Examples

<!-- example: title-and-columns -->
\`\`\`json
{
  "commands": [
    {
      "op": "insertCard",
      "card": {
        "notes": "Contrast the two habits, then ask which one the team already does.",
        "body": [
          { "type": "heading", "level": 2, "text": "Two ways to explain it" },
          {
            "type": "columns",
            "widths": [1, 1],
            "gap": "md",
            "align": "start",
            "children": [
              [
                { "type": "heading", "level": 3, "text": "Tell" },
                { "type": "paragraph", "text": "A short definition the room can repeat." }
              ],
              [
                { "type": "heading", "level": 3, "text": "Show" },
                { "type": "paragraph", "text": "One picture and a single sentence under it." }
              ]
            ]
          }
        ]
      }
    }
  ],
  "label": "Add a comparison slide"
}
\`\`\`

<!-- example: edit-paragraph-and-callout -->
\`\`\`json
{
  "commands": [
    {
      "op": "updateNode",
      "id": "b_lead",
      "patch": { "text": "Plants turn sunlight, water, and air into sugar." }
    },
    {
      "op": "insertNode",
      "node": {
        "type": "callout",
        "tone": "note",
        "text": "Pause here and ask what a plant eats."
      },
      "at": { "after": "b_lead" }
    }
  ],
  "label": "Tighten the lead and add a prompt"
}
\`\`\`

<!-- example: asset-image-and-accent -->
\`\`\`json
{
  "commands": [
    {
      "op": "putAsset",
      "id": "img_guide",
      "asset": {
        "kind": "image",
        "src": "https://example.com/photosynthesis/guide.png",
        "alt": "A simple diagram of a leaf"
      }
    },
    {
      "op": "insertNode",
      "node": {
        "type": "image",
        "assetId": "img_guide",
        "fit": "contain",
        "width": "full",
        "caption": "The leaf, drawn simply."
      },
      "at": { "parent": "c_review" }
    },
    {
      "op": "updateCard",
      "id": "c_review",
      "patch": { "accent": { "position": "right", "assetId": "img_guide" } }
    }
  ],
  "label": "Add a diagram to the review card"
}
\`\`\`

## Common mistakes

- Do not use \`updateNode\` to change \`type\`. The patch is rejected. Use \`replaceNode\` when the block should become a different kind of node.
- Do not use \`updateNode\` to change \`children\`. Insert, move, or delete the child nodes, or replace the container.
- Do not put a card id in \`before\` or \`after\`. Those keys name a node. To insert into a card, use \`{ "parent": "<cardId>" }\`.
- Do not write \`#\` inside heading text. The \`level\` field is the heading. The \`text\` is the words only.
- Do not build \`columns\` from a single node. A columns container needs 2 to 4 columns, and \`widths\` must have one number per column. \`wrapNodes\` with \`columns\` also needs 2 to 4 adjacent siblings, one per column.
- Do not reference an asset id that no command has created and that the document does not already contain. \`putAsset\` in an earlier command of the same batch, then use the id.
- Do not send several independent edits as several \`looma_apply\` calls when they are one intention. The user would have to undo each call separately. One batch is one undo step.
`.trim();
