import type { ReactNode } from "react";

function P({ children }: { children: ReactNode }) {
  return <p className="info-p">{children}</p>;
}

function Term({ children }: { children: ReactNode }) {
  return <span className="info-term">{children}</span>;
}

/**
 * Always-on "Info" tab: what the Context Studio is, the model it implements,
 * and how to use it in practice. Pure prose/reference — no data fetching.
 */
export default function InfoPanel() {
  return (
    <div className="info">
      <section className="info-block">
        <h2>What this is</h2>
        <P>
          <Term>InfoTP Context Studio</Term> is a git-first, self-hosted tool for authoring and
          serving the project&rsquo;s context as <Term>cascading configuration</Term>. The context
          tree has three layers — <span className="mono">Project → Component → Deliverable</span> —
          and each node is a folder in the git store. You edit context here; git is the source of
          truth; agents read it over MCP.
        </P>
      </section>

      <section className="info-block">
        <h2>Two kinds of context</h2>
        <P>
          Everything in the store is one of two kinds, and they behave differently on purpose:
        </P>
        <div className="info-cards">
          <div className="info-card">
            <h3>Directive context</h3>
            <P>
              The <em>rules and constraints</em> an agent must follow. Directives{" "}
              <Term>override by specificity</Term>, like CSS: a more specific (deeper) node wins for
              a given key. They are <Term>inlined</Term> into every agent&rsquo;s prompt and so are{" "}
              <Term>token-budgeted</Term>. Each directive has an operation —{" "}
              <span className="mono">set</span> / <span className="mono">extend</span> /{" "}
              <span className="mono">suppress</span> — a dotted <span className="mono">key</span>,
              and an <span className="mono">applies_to</span> list of kinds.
            </P>
          </div>
          <div className="info-card">
            <h3>Reference context</h3>
            <P>
              The <em>source material</em> an agent may consult — specs, standards, examples. It{" "}
              <Term>accumulates</Term> up the tree (a node sees its own plus every ancestor&rsquo;s),
              and is <Term>fetched on demand</Term> by retrieval (RAG), so it costs ~0 always-on
              tokens. Retrieval is <Term>branch-scoped</Term>: a node only ever sees its own
              branch&rsquo;s corpus, never a sibling&rsquo;s.
            </P>
          </div>
        </div>
      </section>

      <section className="info-block">
        <h2>The three faces</h2>
        <ul className="info-list">
          <li>
            <Term>Authoring UI</Term> (this tool) — browse the tree, edit a node, and watch its
            composed context resolve live.
          </li>
          <li>
            <Term>Git store</Term> — the canonical source of truth. Save writes files; <strong>you</strong>{" "}
            review the diff and commit. Nothing is pushed for you.
          </li>
          <li>
            <Term>MCP serving</Term> — agents connect and receive their node&rsquo;s composed
            directives plus branch-scoped reference retrieval.
          </li>
        </ul>
      </section>

      <section className="info-block">
        <h2>Using it in practice</h2>
        <ol className="info-steps">
          <li>
            <strong>Pick a node</strong> in the tree on the left. Its <strong>Summary</strong> gives
            you the context at a glance — status, kind, the ancestor chain, dependencies, and counts.
          </li>
          <li>
            <strong>Edit in the dropdowns.</strong> Open <em>Fields</em>, <em>Directives</em>, or{" "}
            <em>Prose</em> as needed. Directives are keyed; setting the same key on a deeper node
            overrides the ancestor&rsquo;s, and <span className="mono">applies_to</span> decides which
            node kinds a directive reaches (e.g. coding rules skip a docs-only deliverable).
          </li>
          <li>
            <strong>Watch the composed panel</strong> on the right. It shows the <em>effective</em>{" "}
            directive set after specificity resolution, with provenance (which ancestor each came
            from) and a live token estimate against the budget.
          </li>
          <li>
            <strong>Manage reference material.</strong> Add documents to the node&rsquo;s{" "}
            <em>Corpus</em>, then use <em>Reference search</em> to test what branch-scoped retrieval
            returns for a query.
          </li>
          <li>
            <strong>Save, then commit.</strong> Save writes only the working tree. Review the diff in
            git and commit yourself — the tool never commits or pushes.
          </li>
          <li>
            <strong>Check the Budget tab</strong> for each branch&rsquo;s worst-case leaf token total,
            so directive context stays within budget.
          </li>
        </ol>
      </section>

      <section className="info-block">
        <h2>Reading the tags</h2>
        <P>
          The colored dots and small labels in the tree and summary are not decoration — each one
          is a field of the node&rsquo;s <span className="mono">node.yaml</span>, and several of
          them change how context composes:
        </P>
        <dl className="info-defs">
          <dt>status</dt>
          <dd>
            Lifecycle of the node&rsquo;s work, shown as a colored dot in the tree:{" "}
            <span className="mono">not-started</span> (grey), <span className="mono">in-progress</span>{" "}
            (blue), <span className="mono">blocked</span> (amber), <span className="mono">done</span>{" "}
            (green). Purely informational for composition.
          </dd>
          <dt>kind</dt>
          <dd>
            What the node <em>is</em>: <span className="mono">software</span>,{" "}
            <span className="mono">data</span>, <span className="mono">docs</span>,{" "}
            <span className="mono">api</span>, <span className="mono">infra</span>, or{" "}
            <span className="mono">research</span>. This is the filter that decides which directives
            reach the node: a directive tagged <span className="mono">applies_to: [software]</span>{" "}
            never loads on a <span className="mono">docs</span>-only deliverable — that&rsquo;s how
            the token budget stays lean. A component&rsquo;s kinds are the union of its
            deliverables&rsquo;.
          </dd>
          <dt>owner</dt>
          <dd>
            Role IDs (<span className="mono">RH1</span>, <span className="mono">RH9</span>…) from
            the proposal&rsquo;s hiring plan — who is responsible for this node. At the leaf layer,
            the owner is also the only person allowed to edit it (D8).
          </dd>
          <dt>hito &amp; due month</dt>
          <dd>
            Delivery scheduling straight from the proposal&rsquo;s cronograma: <em>hito</em> is the
            milestone (<span className="mono">A</span>–<span className="mono">F</span>) and{" "}
            <em>due month</em> is the month number (1–16) the result is due at.
          </dd>
          <dt>result</dt>
          <dd>
            What the node produces and who may see it: a <span className="mono">type</span> (data,
            software, api, docs, infra) plus a <span className="mono">visibility</span> of{" "}
            <span className="mono">public</span>, <span className="mono">internal</span>, or{" "}
            <span className="mono">restricted</span>. Visibility matters for what may go into a
            public corpus.
          </dd>
          <dt>depends_on</dt>
          <dd>
            Other nodes this one needs, always as node IDs (never file paths — D1). The composer
            uses these to detect cycles; humans use them to understand build order.
          </dd>
          <dt>directive op (set / extend / suppress)</dt>
          <dd>
            How a directive composes against ancestors for the same{" "}
            <span className="mono">key</span>: <span className="mono">set</span> replaces whatever
            came from above; <span className="mono">extend</span> appends to it;{" "}
            <span className="mono">suppress</span> removes the key entirely from this node down.
            Example: the project sets <em>security.transport-encryption</em>; a stricter component
            could <em>extend</em> it, and a public-website deliverable could{" "}
            <em>suppress</em> an internal-only rule.
          </dd>
          <dt>lang</dt>
          <dd>
            Each directive and corpus file is <span className="mono">en</span> or{" "}
            <span className="mono">es</span>. Directives and reference content are English;
            Spanish where content is institution-facing; never mixed within one file (D7).
          </dd>
        </dl>
      </section>

      <section className="info-block">
        <h2>Using it with an agent</h2>
        <P>
          Agents don&rsquo;t read this UI — they connect to the store&rsquo;s{" "}
          <Term>MCP server</Term> (<span className="mono">tools/mcp</span>), which is read-only and
          serves committed context. The typical setup:
        </P>
        <ol className="info-steps">
          <li>
            <strong>Build and register the server</strong> once per machine:
            <pre className="info-code">
              <code>{`cd tools/mcp && pnpm install && pnpm run build
claude mcp add infotp-context -- node /ABS/PATH/to/context/tools/mcp/dist/index.js`}</code>
            </pre>
            or add it to a project&rsquo;s <span className="mono">.mcp.json</span> under{" "}
            <span className="mono">mcpServers.infotp-context</span>. Any MCP-capable client works,
            not just Claude Code.
          </li>
          <li>
            <strong>Point the agent at a node ID</strong> (e.g. <span className="mono">C2P2</span>{" "}
            — the deliverable it is working on). The agent then has four tools:{" "}
            <span className="mono">list_nodes</span> to browse the catalog,{" "}
            <span className="mono">get_directives</span> for the composed rule block,{" "}
            <span className="mono">search_reference</span> for branch-scoped retrieval over the
            corpus, and <span className="mono">get_budget</span> to check token costs.
          </li>
          <li>
            <strong>Directives go in the prompt; reference is pulled on demand.</strong> The agent
            inlines the directive block (always-on tokens), then queries{" "}
            <span className="mono">search_reference</span> only when it needs specs or background —
            so a large corpus costs nothing until asked for. Retrieval is masked to the
            node&rsquo;s ancestor chain: an agent scoped to <span className="mono">C1P1</span> can
            never see C3&rsquo;s corpus.
          </li>
          <li>
            <strong>Committed vs. live.</strong> By default the server reads the committed{" "}
            <span className="mono">.composed/</span> artifacts, so agents see exactly what was
            reviewed. <span className="mono">get_directives</span> with{" "}
            <span className="mono">live: true</span> recomputes from the working tree — useful for
            checking uncommitted edits, but remember to run{" "}
            <span className="mono">compose --all</span> and commit so the served context stays in
            sync (D4).
          </li>
          <li>
            <strong>Downstream repos.</strong> A product repo&rsquo;s{" "}
            <span className="mono">AGENTS.md</span> is generated from its node&rsquo;s composed
            context — truth flows context → repo, never the other way (D6).
          </li>
        </ol>
      </section>

      <section className="info-block">
        <h2>Concepts worth knowing</h2>
        <dl className="info-defs">
          <dt>Specificity</dt>
          <dd>Deeper nodes override shallower ones for the same directive key.</dd>
          <dt>applies_to</dt>
          <dd>A directive only reaches nodes whose <span className="mono">kind</span> it lists.</dd>
          <dt>Token budget</dt>
          <dd>
            The always-on prompt cost is the <em>directives</em> portion. The meter and Budget tab
            also show <em>reference</em> tokens (the accumulated corpus, fetched via RAG) and the
            total, so you can see both — but only directives are actually inlined. The meter is
            accurate (target-model tokenizer); committed artifacts use a deterministic heuristic.
          </dd>
          <dt>Branch scoping</dt>
          <dd>
            Retrieval for a node is masked to its ancestor chain — sibling branches never leak in.
          </dd>
          <dt>Blast radius</dt>
          <dd>
            Editing a shallow node affects all of its descendants; Save reports the blast radius so
            you know how far a change reaches.
          </dd>
        </dl>
      </section>
    </div>
  );
}
