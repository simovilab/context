import type { ReactNode } from "react";

function Term({ children }: { children: ReactNode }) {
  return <span className="info-term">{children}</span>;
}

function M({ children }: { children: ReactNode }) {
  return <span className="mono">{children}</span>;
}

/**
 * Always-on "Info" tab: what the Context Studio is, the model it implements,
 * a field/key reference, and how to use it (UI + agents). Pure prose/reference
 * — no data fetching.
 */
export default function InfoPanel() {
  return (
    <div className="info">
      <section className="info-block">
        <h2>What this is</h2>
        <p className="info-p">
          <Term>InfoTP Context Studio</Term> authors and serves the project&rsquo;s context as{" "}
          <Term>cascading configuration</Term>, three layers deep —{" "}
          <M>Project → Component → Deliverable</M> — each node a folder in the git store. Git is
          the source of truth; this UI edits it; agents read it over MCP.
        </p>
      </section>

      <section className="info-block">
        <h2>Two kinds of context</h2>
        <div className="info-cards">
          <div className="info-card">
            <h3>Directives</h3>
            <p className="info-p">
              Rules an agent must follow. <Term>Override by specificity</Term> (deeper node wins,
              like CSS), <Term>inlined</Term> into every prompt, so <Term>token-budgeted</Term>.
            </p>
          </div>
          <div className="info-card">
            <h3>Reference</h3>
            <p className="info-p">
              Source material an agent may consult. <Term>Accumulates</Term> down the tree,{" "}
              <Term>fetched on demand</Term> via RAG (~0 always-on cost), <Term>branch-scoped</Term>{" "}
              — a node never sees a sibling&rsquo;s corpus.
            </p>
          </div>
        </div>
      </section>

      <section className="info-block">
        <h2>Node field reference</h2>
        <p className="info-p">
          Every node is a <M>node.yaml</M>. These fields are also what the tree/summary tags show.
        </p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Values</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>status</M>
              </td>
              <td>not-started · in-progress · blocked · done</td>
              <td>Lifecycle dot in the tree. Informational only — doesn&rsquo;t affect composition.</td>
            </tr>
            <tr>
              <td>
                <M>kind</M>
              </td>
              <td>software · data · docs · api · infra · research</td>
              <td>
                What the node <em>is</em>. Filters which directives reach it (
                <M>applies_to</M> match) — a component&rsquo;s kinds are the union of its
                deliverables&rsquo;.
              </td>
            </tr>
            <tr>
              <td>
                <M>owner</M>
              </td>
              <td>role IDs, e.g. RH1</td>
              <td>Who&rsquo;s responsible. At leaf layer, the only one allowed to edit (D8).</td>
            </tr>
            <tr>
              <td>
                <M>hito</M> / <M>due_month</M>
              </td>
              <td>A–F / 1–16</td>
              <td>Milestone and due month, from the proposal&rsquo;s cronograma.</td>
            </tr>
            <tr>
              <td>
                <M>result</M>
              </td>
              <td>
                <M>type</M> + <M>visibility</M> (public/internal/restricted)
              </td>
              <td>What the node produces and who may see it — visibility gates what enters a public corpus.</td>
            </tr>
            <tr>
              <td>
                <M>depends_on</M>
              </td>
              <td>node IDs</td>
              <td>Other nodes this needs. Node IDs only, never file paths (D1); used for cycle detection.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="info-block">
        <h2>Directive key reference</h2>
        <p className="info-p">
          Each entry in a node&rsquo;s <M>directives.yaml</M> has:
        </p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Values</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>key</M>
              </td>
              <td>dotted kebab, e.g. security.transport-encryption</td>
              <td>Identity a directive composes on — same key on a deeper node overrides an ancestor&rsquo;s.</td>
            </tr>
            <tr>
              <td>
                <M>op</M>
              </td>
              <td>set · extend · suppress</td>
              <td>
                <M>set</M> replaces the ancestor&rsquo;s text; <M>extend</M> appends to it;{" "}
                <M>suppress</M> removes the key from this node down (no <M>text</M> needed).
              </td>
            </tr>
            <tr>
              <td>
                <M>applies_to</M>
              </td>
              <td>list of kinds</td>
              <td>Which node kinds this directive reaches — a software-only rule skips a docs deliverable.</td>
            </tr>
            <tr>
              <td>
                <M>text</M>
              </td>
              <td>string</td>
              <td>The rule itself. Required unless <M>op: suppress</M>.</td>
            </tr>
            <tr>
              <td>
                <M>lang</M>
              </td>
              <td>en · es</td>
              <td>English for technical/agent-facing content; Spanish for institution-facing. Never mixed in one file (D7).</td>
            </tr>
          </tbody>
        </table>
        <p className="info-p">
          Example: project sets <em>security.transport-encryption</em>; a component{" "}
          <M>extend</M>s it; a public-website deliverable <M>suppress</M>es an internal-only rule.
        </p>
      </section>

      <section className="info-block">
        <h2>Using the UI</h2>
        <ol className="info-steps">
          <li>
            <strong>Pick a node</strong> in the Authoring tree (left). Its summary shows status,
            kind, ancestor chain, dependencies, and counts at a glance.
          </li>
          <li>
            <strong>Edit</strong> in <em>Fields</em>, <em>Directives</em>, or <em>Prose</em>. A
            directive key set on a deeper node overrides the ancestor&rsquo;s automatically.
          </li>
          <li>
            <strong>Watch Composed</strong> (right) — the effective directive set post-resolution,
            with provenance and a live token estimate vs. budget.
          </li>
          <li>
            <strong>Manage reference material</strong> in <em>Corpus</em>; test retrieval with{" "}
            <em>Reference search</em>.
          </li>
          <li>
            <strong>Save, then commit yourself.</strong> Save only writes the working tree — review
            the diff and commit in git; nothing is pushed automatically.
          </li>
          <li>
            <strong>Budget tab</strong> — each branch&rsquo;s worst-case leaf token total against
            the budget (D9).
          </li>
        </ol>
      </section>

      <section className="info-block">
        <h2>Using it with an agent</h2>
        <p className="info-p">
          Agents don&rsquo;t use this UI — they connect over MCP (<M>tools/mcp</M>), read-only,
          serving committed context.
        </p>
        <pre className="info-code">
          <code>{`cd tools/mcp && pnpm install && pnpm run build
claude mcp add infotp-context -- node /ABS/PATH/to/context/tools/mcp/dist/index.js`}</code>
        </pre>
        <p className="info-p">
          (or add to a project&rsquo;s <M>.mcp.json</M> under <M>mcpServers.infotp-context</M> —
          any MCP client works.) Point the agent at a node ID (e.g. <M>C2P2</M>); it gets four tools:
        </p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>list_nodes</M>
              </td>
              <td>Browse the catalog, optionally filtered by layer/component.</td>
            </tr>
            <tr>
              <td>
                <M>get_directives</M>
              </td>
              <td>
                The composed rule block for a node id. Add <M>live: true</M> to recompute from the
                working tree instead of the committed <M>.composed/</M> snapshot.
              </td>
            </tr>
            <tr>
              <td>
                <M>search_reference</M>
              </td>
              <td>Branch-scoped RAG over the corpus — a node never sees a sibling branch&rsquo;s material.</td>
            </tr>
            <tr>
              <td>
                <M>get_budget</M>
              </td>
              <td>Per-branch worst-case-leaf token report and any overflowing nodes.</td>
            </tr>
          </tbody>
        </table>
        <p className="info-p">
          Directives are inlined into the prompt up front (always-on cost); reference is pulled
          only when queried. After editing context, run <M>compose --all</M> and commit so served
          context stays in sync (D4) — a downstream repo&rsquo;s <M>AGENTS.md</M> is generated from
          its node&rsquo;s composed context, never the reverse (D6).
        </p>
      </section>

      <section className="info-block">
        <h2>Concepts worth knowing</h2>
        <dl className="info-defs">
          <dt>Specificity</dt>
          <dd>Deeper nodes override shallower ones for the same directive key.</dd>
          <dt>Branch scoping</dt>
          <dd>Retrieval for a node is masked to its ancestor chain only.</dd>
          <dt>Blast radius</dt>
          <dd>Editing a shallow node affects every descendant; Save reports how far a change reaches.</dd>
          <dt>Committed vs. live</dt>
          <dd>
            Agents see committed <M>.composed/</M> by default — exactly what was reviewed, not
            unsaved edits.
          </dd>
          <dt>Token estimate</dt>
          <dd>
            Directives are the always-on prompt cost; reference tokens (shown alongside) are RAG-fetched,
            not inlined. The meter uses the target-model tokenizer; committed artifacts use a
            deterministic heuristic.
          </dd>
        </dl>
      </section>
    </div>
  );
}
