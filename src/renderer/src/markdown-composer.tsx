import { slashQueryAt, type SlashQuery } from "../../shared/slash-commands";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

export type MarkdownComposerHandle = {
  focus: (position?: "end") => void;
  replaceCommand: (query: SlashQuery, text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (text: string) => void;
  recallPrompt: (text: string) => void;
  canRecallPrompt: (direction: "up" | "down", browsing: boolean) => boolean;
};

export function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|\s*$)/m.test(text)
    || /\*\*\S[^*]*\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(text);
}

export const MarkdownComposer = forwardRef<MarkdownComposerHandle, {
  paneId: string;
  value: string;
  onChange: (value: string) => void;
  onSlashQuery?: (query: SlashQuery | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  placeholder: string;
  title: string;
  disabled: boolean;
  suggestions?: { id: string; activeId?: string };
}>(function MarkdownComposer({ paneId, value, onChange, onSlashQuery, onKeyDown, onPaste, placeholder, title, disabled, suggestions }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSlashQueryRef = useRef(onSlashQuery);
  onSlashQueryRef.current = onSlashQuery;
  function publishSlashQuery(editor: import("@tiptap/react").Editor) {
    const { $from, empty } = editor.state.selection;
    if (!empty || $from.parent.type.spec.code || $from.marks().some(mark => mark.type.name === "code")
      || Array.from({ length: $from.depth }, (_, index) => $from.node(index + 1).type.name).includes("blockquote")) {
      onSlashQueryRef.current?.(null); return;
    }
    const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\ufffc");
    const query = slashQueryAt(text, $from.parentOffset);
    onSlashQueryRef.current?.(query ? { ...query, from: $from.start() + query.from, to: $from.start() + query.to } : null);
  }
  const readyRef = useRef(false);
  const syncingRef = useRef(false);
  const lastMarkdownRef = useRef<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: { "data-pane-id": paneId, "aria-label": "Message", role: "textbox", "aria-multiline": "true" },
    },
    onSelectionUpdate: ({ editor }) => publishSlashQuery(editor),
    onUpdate: ({ editor }) => {
      publishSlashQuery(editor);
      if (!readyRef.current || syncingRef.current) return;
      const markdown = editor.getMarkdown();
      if (markdown === lastMarkdownRef.current) return;
      lastMarkdownRef.current = markdown;
      onChangeRef.current(markdown);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getMarkdown() !== value) {
      syncingRef.current = true;
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
      syncingRef.current = false;
    }
    lastMarkdownRef.current = editor.getMarkdown();
    readyRef.current = true;
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({ editorProps: { attributes: {
      "data-pane-id": paneId, "aria-label": "Message", role: "textbox", "aria-multiline": "true",
      ...(suggestions ? { "aria-controls": suggestions.id, "aria-activedescendant": suggestions.activeId ?? "", "aria-autocomplete": "list", "aria-expanded": "true" } : {}),
    } } });
  }, [editor, paneId, suggestions?.id, suggestions?.activeId]);

  useImperativeHandle(ref, () => ({
    recallPrompt: (text) => {
      if (!editor) return;
      editor.commands.setContent(text, { contentType: "markdown", emitUpdate: false });
      editor.commands.setTextSelection(editor.state.doc.content.size);
      lastMarkdownRef.current = editor.getMarkdown();
    },
    canRecallPrompt: (direction, browsing) => {
      if (!editor || !editor.state.selection.empty) return false;
      if (browsing) return true;
      const { $head } = editor.state.selection;
      // A textblock boundary may be in the middle of the draft (paragraphs,
      // list items, quotes). Let arrows cross those blocks before recalling.
      for (let depth = 0; depth < $head.depth; depth++) {
        const index = $head.index(depth), count = $head.node(depth).childCount;
        if (direction === "up" ? index > 0 : index < count - 1) return false;
      }
      return editor.view.endOfTextblock(direction);
    },
    replaceCommand: (query, text) => {
      if (!editor || query.from < 0 || query.to > editor.state.doc.content.size) return;
      const to = text.endsWith(" ") && editor.state.doc.textBetween(query.to, Math.min(query.to + 1, editor.state.doc.content.size)) === " " ? query.to + 1 : query.to;
      if (text) editor.chain().focus().insertContentAt({ from: query.from, to }, { type: "text", text }).run();
      else editor.chain().focus().deleteRange({ from: query.from, to }).run();
    },
    focus: (position) => { editor?.commands.focus(position); },
    appendText: (text) => { editor?.chain().focus("end").insertContent({ type: "text", text }).run(); },
    replaceSelection: (text) => { editor?.chain().focus().insertContent({ type: "text", text }).run(); },
  }), [editor]);

  return <div className="u-markdown-composer" title={title} onKeyDownCapture={onKeyDown} onPasteCapture={(event) => {
    onPaste(event);
    if (event.defaultPrevented || !editor || event.clipboardData.getData("text/html")) return;
    const text = event.clipboardData.getData("text/plain");
    if (!looksLikeMarkdown(text)) return;
    event.preventDefault();
    editor.commands.insertContent(text, { contentType: "markdown" });
  }}>
    {!value && <span className="u-markdown-composer-placeholder">{placeholder}</span>}
    <EditorContent editor={editor} />
  </div>;
});
