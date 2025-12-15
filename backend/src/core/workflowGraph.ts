import { WorkflowSnapshot } from "./types";

export function computeWorkflowTopo(workflow: WorkflowSnapshot) {
  const nodeIds = workflow.nodes.map((n) => n.id);
  const nodeIdSet = new Set(nodeIds);

  const indeg = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const id of nodeIds) {
    indeg.set(id, 0);
    incoming.set(id, []);
    outgoing.set(id, []);
  }

  for (const e of workflow.edges) {
    if (!nodeIdSet.has(e.from) || !nodeIdSet.has(e.to)) continue;
    if (e.from === e.to) continue;
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    incoming.get(e.to)!.push(e.from);
    outgoing.get(e.from)!.push(e.to);
  }

  const q: string[] = [];
  for (const [id, d] of indeg.entries()) {
    if (d === 0) q.push(id);
  }

  const order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const to of outgoing.get(id) || []) {
      indeg.set(to, (indeg.get(to) || 0) - 1);
      if (indeg.get(to) === 0) q.push(to);
    }
  }

  if (order.length !== nodeIds.length) {
    throw new Error("Workflow has a cycle or disconnected references");
  }

  return { order, incoming, outgoing };
}

