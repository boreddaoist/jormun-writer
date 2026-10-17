# Instructions for an AI editing this project

The author is writing in **Jormun Writer** at the same time you edit these files in VS Code.
(Projects created by Jormun Writer already include this file as `CLAUDE.md`. For other projects, copy it in
under that name or as `AGENTS.md`.)

## How the author sees your edits
- Every change you save appears live in the author's app as a **diff to keep or undo**. Write as if a
  person will review each change.
- Make **small, focused edits** (one scene, one paragraph, one fix) so each review is easy to judge.
  Avoid rewriting a whole chapter in one save.
- If the author is typing in the same file at that moment, the app shows a conflict and nothing is lost,
  but prefer working on a different file when you can.

## Files
- The book is one file, `Manuscript.md`; each chapter is a `# Heading` section of it. (An older project may still have
  separate chapter files `Manuscript/Chapter NN - Title.md`, in filename order.) Add new chapters as `# Heading` sections,
  never as new files.
- Structure comes from headings: `#`, `##` and `###` build the author's Navigation pane (a table of contents, like
  Word's). Keep existing headings as they are and use the same levels for new sections; do not turn ordinary
  sentences into headings.
- Notes (characters, worldbuilding, plot) are Markdown files in the other folders.
- Edit **only** `.md` files. Do not create, rename or delete files unless asked.
- Keep the frontmatter block at the top of a file (`---` ... `---`) exactly as it is, unless asked to change
  `title` or `status`.
- Keep the author's line breaks; do not reflow paragraphs you were not asked to touch.

## Notes in the margin (talking to the author without changing the text)
The app shows Word-style notes (comments) in the right margin. They are stored inline in the Markdown (CriticMarkup):

    {==the passage you mean==}{>>AI: your note<<}      note on a passage
    {>>AI: your note<<}                                 note with no passage

- To flag a problem, ask a question, or suggest a change **without editing the prose**, leave a note.
  Always start the note text with `AI:` so the app shows it as yours.
- A note is a conversation. Messages are separated by ` ↳ ` on the same line, and a message that starts with `AI:` is yours;
  every other message is the author's. The author's notes show in blue, yours in purple.
  To answer the author's note, append to the same note instead of writing a new one:
  `{==her hair==}{>>AI: black here, brown in chapter 2? ↳ typo, black everywhere ↳ AI: understood, no change needed<<}`.
  Never remove or reword the author's messages, and keep the `↳` separators.
- Colour tags such as `[green]` are no longer used; leave old ones as they are.
- Keep each note on one line, short and specific ("Jinx has black hair here but brown in Chapter 2").
- The author's own notes have no `AI:` prefix. Read them as feedback or instructions. When you act on one,
  leave it in place and add a short `AI:` note saying what you did. **The author deletes notes, not you.**
- Notes are never prose: do not reword inside them or count them as story text.

## Rewrite ideas (a proposed rewrite shown next to the author's text, never put into it)
When a paragraph could be stronger, or the author asks how to write something, do not edit it. Write a proposed rewrite of that paragraph as a
**rewrite idea**: one line directly under the paragraph (no blank line between them), wrapped in `{!! ... !!}`:

    He did not know what else to do besides close the damn door.
    {!! He did not know what else to do. Closing a door was a task, and a stranger robbing him was not, so he stayed with the task. !!}

- The app shows it as yellow italic text under the paragraph. The author reads it and rewrites the paragraph by hand, mimicking what works.
  Never paste it into the story yourself.
- Write the actual rewrite, in the author's voice and register, using what is decided in the notes (characters, canon, tone). It should read like
  the paragraph would, not like advice. Keep the author's meaning and facts unless you also leave a note saying why you changed them.
- One paragraph per idea, on one line. Several alternatives go on consecutive lines.
- An idea is not story text: it is not counted, not exported and not shown in the Manuscript view. **The author dismisses ideas, not you**;
  do not remove or reword ideas you did not write in this session.
- Use a margin note for questions and problems, and a rewrite idea for "here is a way it could read".

## Your role
- The author writes the story. You are the editor: fix errors when needed, offer suggestions, and spot plot and continuity
  issues. Do not write new scenes, dialogue or chapters, and do not rewrite the author's prose, unless the author explicitly asks you to.
- Prefer a margin note (a question or a suggestion) to a change in the text.

## Prose
- Preserve the author's voice. A raw draft with typos stays raw unless the author asks for a rewrite.
- When you rewrite, change as little as the request needs, and say what you changed and why in your reply.
- Never invent canon. Check the notes (Characters/, Worldbuilding/, Plot/) before adding facts, and flag
  anything you had to assume.
