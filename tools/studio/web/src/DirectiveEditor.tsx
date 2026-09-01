import { KINDS, LANGS, OPS } from "./types";
import type { Directive, Kind } from "./types";

interface DirectiveEditorProps {
  directives: Directive[];
  onChange: (next: Directive[]) => void;
}

function emptyDirective(): Directive {
  return { key: "", op: "set", applies_to: [], text: "", lang: "en" };
}

export default function DirectiveEditor({ directives, onChange }: DirectiveEditorProps) {
  function update(index: number, patch: Partial<Directive>) {
    const next = directives.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function remove(index: number) {
    onChange(directives.filter((_, i) => i !== index));
  }

  function toggleKind(index: number, kind: Kind) {
    const d = directives[index];
    const has = d.applies_to.includes(kind);
    const applies_to = has ? d.applies_to.filter((k) => k !== kind) : [...d.applies_to, kind];
    update(index, { applies_to });
  }

  function add() {
    onChange([...directives, emptyDirective()]);
  }

  return (
    <div>
      {directives.length === 0 && <div className="empty-state">No local directives.</div>}
      {directives.map((d, i) => (
        <div className="directive-row" key={i}>
          <div className="directive-row-top">
            <div className="field-row" style={{ margin: 0 }}>
              <label>key</label>
              <input
                type="text"
                value={d.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="security.transport-encryption"
              />
            </div>
            <div className="field-row" style={{ margin: 0 }}>
              <label>op</label>
              <select value={d.op} onChange={(e) => update(i, { op: e.target.value as Directive["op"] })}>
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ margin: 0 }}>
              <label>lang</label>
              <select value={d.lang ?? "en"} onChange={(e) => update(i, { lang: e.target.value as Directive["lang"] })}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ margin: 0 }}>
              <label>applies_to</label>
              <div className="multiselect">
                {KINDS.map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={d.applies_to.includes(k)}
                      onChange={() => toggleKind(i, k)}
                    />
                    {k}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <button onClick={() => remove(i)} title="Remove directive">
                Remove
              </button>
            </div>
          </div>
          <div className="field-row" style={{ margin: 0 }}>
            <label>text{d.op === "suppress" ? " (unused for suppress)" : ""}</label>
            <textarea
              rows={3}
              disabled={d.op === "suppress"}
              value={d.text ?? ""}
              onChange={(e) => update(i, { text: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button onClick={add}>+ Add directive</button>
    </div>
  );
}
