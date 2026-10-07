import { forwardRef, useEffect, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

export type MarkdownComposerHandle = {
  focus: () => void;
  appendText: (text: string) => void;
  replaceSelection: (text: string) => void;
};

export function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|\s*$)/m.test(text)
    || /\*\*\S[^*]*\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(text);
}

export const MarkdownComposer = forwardRef<MarkdownComposerHandle, {
  paneId: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  placeholder: string;
  title: string;
  disabled: boolean;
}>(function MarkdownComposer({ paneId, value, onChange, onKeyDown, onPaste, placeholder, title, disabled }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
    onUpdate: ({ editor }) => {
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

  useImperativeHandle(ref, () => ({
    focus: () => { editor?.commands.focus(); },
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
