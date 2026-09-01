import { useEffect, useState } from "react";
import { putNode } from "./api";
import DirectiveEditor from "./DirectiveEditor";
import TagListInput from "./TagListInput";
import { HITOS, KINDS, STATUSES, VISIBILITIES } from "./types";
import type { Directive, Hito, Kind, NodeDetail, NodeFields, Status, Visibility } from "./types";

interface NodeEditorProps {
  node: NodeDetail;
  onSaved: (updated: NodeDetail, blastRadius: string | null) => void;
}

export default function NodeEditor({ node, onSaved }: NodeEditorProps) {
  const [fields, setFields] = useState<NodeFields>(node.fields);
  const [localDirectives, setLocalDirectives] = useState<Directive[]>(node.localDirectives);
  const [referenceMd, setReferenceMd] = useState<string>(node.referenceMd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [blastRadius, setBlastRadius] = useState<string | null>(null);

  useEffect(() => {
    setFields(node.fields);
    setLocalDirectives(node.localDirectives);
    setReferenceMd(node.referenceMd);
    setError(null);
    setSavedNotice(null);
    setBlastRadius(null);
  }, [node]);

  function patchFields(patch: Partial<NodeFields>) {
    setFields((f) => ({ ...f, ...patch }));
  }

  function toggleKind(kind: Kind) {
    const has = fields.kind.includes(kind);
    patchFields({ kind: has ? fields.kind.filter((k) => k !== kind) : [...fields.kind, kind] });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const { id: _id, name: _name, ...editableFields } = fields;
      void _id;
      void _name;
      const { data, blastRadius: br } = await putNode(node.id, {
        fields: editableFields,
        localDirectives,
        referenceMd,
      });
      setBlastRadius(br);
      setSavedNotice("Saved");
      onSaved(data, br);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="section-title">Identity</div>
      <div className="field-row">
        <label>id</label>
        <div className="readonly-value">{fields.id}</div>
      </div>
      <div className="field-row">
        <label>name</label>
        <div className="readonly-value">{fields.name}</div>
      </div>

      <div className="section-title">Fields</div>
      <div className="field-row">
        <label>status</label>
        <select value={fields.status} onChange={(e) => patchFields({ status: e.target.value as Status })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label>owner (role ids)</label>
        <TagListInput values={fields.owner} onChange={(owner) => patchFields({ owner })} placeholder="RH5" />
      </div>
      <div className="field-row">
        <label>kind</label>
        <div className="multiselect">
          {KINDS.map((k) => (
            <label key={k}>
              <input type="checkbox" checked={fields.kind.includes(k)} onChange={() => toggleKind(k)} />
              {k}
            </label>
          ))}
        </div>
      </div>
      <div className="field-row">
        <label>depends_on (node ids)</label>
        <TagListInput
          values={fields.depends_on}
          onChange={(depends_on) => patchFields({ depends_on })}
          placeholder="C3P1"
        />
      </div>
      <div className="field-row">
        <label>result type</label>
        <input
          type="text"
          value={fields.result?.type ?? ""}
          onChange={(e) =>
            patchFields({
              result: { type: e.target.value, visibility: fields.result?.visibility ?? "internal" },
            })
          }
          placeholder="report, dataset, service..."
        />
      </div>
      <div className="field-row">
        <label>result visibility</label>
        <select
          value={fields.result?.visibility ?? "internal"}
          onChange={(e) =>
            patchFields({
              result: { type: fields.result?.type ?? "", visibility: e.target.value as Visibility },
            })
          }
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label>hito</label>
        <select
          value={fields.hito ?? ""}
          onChange={(e) => patchFields({ hito: (e.target.value || undefined) as Hito | undefined })}
        >
          <option value="">(none)</option>
          {HITOS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label>due_month (1-16)</label>
        <input
          type="number"
          min={1}
          max={16}
          value={fields.due_month ?? ""}
          onChange={(e) =>
            patchFields({ due_month: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </div>

      <div className="section-title">Local directives</div>
      <DirectiveEditor directives={localDirectives} onChange={setLocalDirectives} />

      <div className="section-title">Prose ({node.proseFile})</div>
      <div className="field-row">
        <textarea
          rows={14}
          value={referenceMd}
          onChange={(e) => setReferenceMd(e.target.value)}
        />
      </div>

      {node.corpus.length > 0 && (
        <>
          <div className="section-title">Corpus (read-only)</div>
          <div className="taglist">
            {node.corpus.map((f) => (
              <span className="tag" key={f}>
                {f}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="save-bar">
        <button className="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {savedNotice && <span className="notice ok">{savedNotice}</span>}
        {blastRadius && <span className="notice">Blast radius: {blastRadius}</span>}
      </div>
      <div className="notice">Save writes the working tree only — commit in git yourself.</div>
    </div>
  );
}
