import { useEffect, useRef } from "react";
import ace from "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/theme-tomorrow_night";
import "ace-builds/src-noconflict/ext-language_tools";

type Props = {
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
};

export function JsonCodeEditor({ value, onChange, isDark }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof ace.edit> | null>(null);
  const changeRef = useRef(onChange);

  changeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current || editorRef.current) return;

    const editor = ace.edit(hostRef.current);
    editorRef.current = editor;

    editor.session.setMode("ace/mode/json");
    editor.setTheme(isDark ? "ace/theme/tomorrow_night" : "ace/theme/textmate");
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false,
      enableSnippets: false,
      showPrintMargin: false,
      fontSize: "13px",
    });
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(2);
    editor.session.setUseWrapMode(true);
    editor.session.setFoldStyle("markbegin");
    editor.setValue(value, -1);

    const onEditorChange = () => {
      changeRef.current(editor.getValue());
    };
    editor.session.on("change", onEditorChange);

    return () => {
      editor.session.off("change", onEditorChange);
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setTheme(isDark ? "ace/theme/tomorrow_night" : "ace/theme/textmate");
  }, [isDark]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() === value) return;
    const position = editor.getCursorPosition();
    editor.setValue(value, -1);
    editor.moveCursorToPosition(position);
  }, [value]);

  return (
    <div
      ref={hostRef}
      style={{
        width: "100%",
        height: 380,
        borderRadius: 12,
        border: "1px solid rgba(128, 128, 128, 0.35)",
        overflow: "hidden",
      }}
      aria-label="JSON-редактор"
    />
  );
}
