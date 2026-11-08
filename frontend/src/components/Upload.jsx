import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Field, Icon, Modal, inputClass } from "./ui";
import { tr } from "../lib/i18n";

const ACCEPT = ".pdf,.docx,.txt,.md,.epub,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac";
const FORMATS = ["PDF", "DOCX", "TXT", "EPUB", "IMAGES", "AUDIO", "LINKS"];

/** Uploads a file or pasted text, then opens the new document and starts its summary. */
function useUpload() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const submit = async ({ file, text, title, subject }) => {
    setError("");
    setBusy(file ? tr("Reading {name}…", { name: file.name }) : tr("Reading your notes…"));
    const form = new FormData();
    if (title) form.append("title", title);
    if (subject) form.append("subject", subject);
    if (file) form.append("file", file);
    else form.append("text", text);
    try {
      const doc = await api("/documents", { method: "POST", form });
      navigate(`/doc/${doc.id}?new=1`);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };
  const submitLink = async ({ url, title, subject }) => {
    setError("");
    setBusy(tr("Importing from the link…"));
    try {
      const doc = await api("/documents/link", { method: "POST", json: { url, title, subject } });
      navigate(`/doc/${doc.id}?new=1`);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };
  return { submit, submitLink, busy, error, setError };
}

export function LinkModal({ open, onClose }) {
  const { submitLink, busy, error } = useUpload();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={tr("Import from a link")}>
      <form onSubmit={(e) => { e.preventDefault(); submitLink({ url, title, subject: "" }); }} className="space-y-4">
        <Field label={tr("Web address")} hint={tr("A web article, or a YouTube video that has captions.")} error={error}>
          <input className={inputClass} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required autoFocus />
        </Field>
        <Field label={tr("Title")} hint={tr("Optional. We'll name it for you.")}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="text-xs text-faint">{tr("Some websites do not allow automated reading. If that happens, save the page as a PDF and upload it instead.")}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="plain" onClick={onClose} disabled={!!busy}>{tr("Cancel")}</Button>
          <Button type="submit" disabled={!url.trim() || !!busy} icon="link">{busy || tr("Import")}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PasteModal({ open, onClose }) {
  const { submit, busy, error } = useUpload();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const enough = text.trim().length >= 200;
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={tr("Paste your notes")} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("Title")} hint={tr("Optional. We'll name it for you.")}>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Cellular Respiration")} />
          </Field>
          <Field label={tr("Subject")} hint={tr("Optional, e.g. Biology 101")}>
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={tr("Biology 101")} />
          </Field>
        </div>
        <Field label={tr("Notes")} hint={tr("{n} characters. At least 200 are needed.", { n: text.trim().length })} error={error}>
          <textarea className={`${inputClass} min-h-48 resize-y`} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Paste lecture notes, a chapter, or an article…")} />
        </Field>
        <div className="flex justify-end gap-3">
          <Button variant="plain" onClick={onClose} disabled={!!busy}>{tr("Cancel")}</Button>
          <Button onClick={() => submit({ text, title, subject })} disabled={!enough || !!busy} icon="auto_awesome">
            {busy || tr("Generate study kit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Dropzone() {
  const { submit, busy, error } = useUpload();
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);
  const [link, setLink] = useState(false);
  const input = useRef();
  const camera = useRef();

  const pick = (files) => files?.[0] && submit({ file: files[0] });

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${over ? "border-brand bg-brand/10" : "border-line/70 bg-low/60"}`}
      >
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files)} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files)} />
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-high text-primary">
          <Icon name={busy ? "hourglass_top" : "upload_file"} size={28} className={busy ? "animate-pulse" : ""} />
        </span>
        <h2 className="text-2xl font-semibold">{busy || tr("Upload New Notes")}</h2>
        <p className="mx-auto mt-2 max-w-md text-mute">
          {busy ? tr("Extracting text and labelling your material. This takes a few seconds.") : tr("Drag and drop your lecture slides or reading files here to generate instant 3-tier summaries and mastery flashcards.")}
        </p>
        {!busy && (
          <>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {FORMATS.map((f) => (
                <span key={f} className="rounded-lg bg-high px-3 py-1 text-xs font-semibold tracking-wider text-mute">{f}</span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
              <Button onClick={() => input.current.click()} icon="folder_open">{tr("Choose a file")}</Button>
              <Button variant="ghost" onClick={() => camera.current.click()} icon="photo_camera">{tr("Take a photo")}</Button>
              <Button variant="ghost" onClick={() => setLink(true)} icon="link">{tr("From a link")}</Button>
              <span className="text-mute">
                {tr("or")}{" "}
                <button onClick={() => setPaste(true)} className="font-semibold text-cyan underline-offset-4 hover:underline">
                  {tr("paste raw text")} <Icon name="content_paste" size={16} className="align-text-bottom" />
                </button>
              </span>
            </div>
          </>
        )}
        {error && <p className="mt-4 text-sm text-coral" role="alert">{error}</p>}
      </div>
      <PasteModal open={paste} onClose={() => setPaste(false)} />
      <LinkModal open={link} onClose={() => setLink(false)} />
    </>
  );
}
