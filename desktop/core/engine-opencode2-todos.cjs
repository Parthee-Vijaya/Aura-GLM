// SPDX-License-Identifier: EUPL-1.2
// This fixed, bundled compatibility plugin restores V1's task-list tools and
// its foreground-only command lifecycle.
// It uses OpenCode's own pinned plugin runtime and private plugin storage, with
// no filesystem, shell, network, SDK download, or user-supplied plugin loading.
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const SOURCE = `import { Schema } from "effect";
const Todo = Schema.Struct({ content: Schema.String.check(Schema.isMaxLength(2000)), status: Schema.Literals(["pending", "in_progress", "completed", "cancelled"]), priority: Schema.optionalKey(Schema.Literals(["high", "medium", "low"])), id: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))) });
const Todos = Schema.Array(Todo).check(Schema.isMaxLength(30));
const foregroundDescription = "Execute a shell command in the specified working directory and wait for completion. Aura requires foreground execution so Stop can cancel the command. Background jobs are unavailable; omit background or set it to false. Existing command and directory approval rules still apply.";
export default { id: "aura.task-list.compatibility", async setup(ctx) {
  // Check raw model input before schema decoding can discard unknown fields.
  await ctx.tool.hook("execute.before", event => {
    if (event.tool === "shell" && event.input && event.input.background === true) throw new Error("Permission denied: shell");
  });
  await ctx.tool.transform(editor => {
    // V2 adds unapproved session/worktree management through code mode. Aura
    // keeps its existing host controls and exposes only its established tools.
    const allowed = new Set(["read", "write", "edit", "patch", "glob", "grep", "shell", "webfetch", "question", "skill"]);
    for (const tool of editor.list()) if (!allowed.has(tool.name) || tool.options?.namespace) editor.remove(tool.id);
    // Keep the released shell executor/permission path, but never acquire V2
    // background jobs that could write or wake a model after Aura's turn ends.
    editor.update("shell", tool => {
      const execute = tool.execute;
      tool.description = foregroundDescription;
      tool.input = Schema.Struct({ command: Schema.String, workdir: Schema.optionalKey(Schema.String), timeout: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))), background: Schema.optionalKey(Schema.Literal(false)) });
      tool.execute = async (input, context) => {
        if (input.background === true) throw new Error("Permission denied: shell");
        context.signal.throwIfAborted();
        return execute({ ...input, background: false }, context);
      };
    });
    editor.add({ name: "todowrite", description: "Create and update the task list for the current task. Keep each item concrete and track pending, in_progress, completed or cancelled work.", options: { codemode: false }, input: Schema.Struct({ todos: Todos }), output: Schema.Struct({ todos: Todos }), async execute(input, context) {
      await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: "todowrite", resources: ["*"], source: { type: "tool", messageID: context.messageID, id: context.id } });
      context.signal.throwIfAborted();
      await ctx.storage.set("todos/" + context.sessionID, input.todos);
      return { output: { todos: input.todos }, content: JSON.stringify(input.todos), metadata: { todos: input.todos } };
    }});
    editor.add({ name: "todoread", description: "Read the task list for the current task.", options: { codemode: false }, input: Schema.Struct({}), output: Schema.Struct({ todos: Todos }), async execute(input, context) {
      await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: "todoread", resources: ["*"], source: { type: "tool", messageID: context.messageID, id: context.id } });
      context.signal.throwIfAborted();
      const todos = await ctx.storage.get("todos/" + context.sessionID) || [];
      return { output: { todos }, content: JSON.stringify(todos), metadata: { todos } };
    }});
  });
  // The released shell context hook regenerates its description per model turn.
  // Keep its final model-facing contract consistent with the guarded schema.
  await ctx.session.hook("context", event => {
    if (event.tools.shell) event.tools.shell.description = foregroundDescription;
  });
}};
`;
const SHA256 = createHash('sha256').update(SOURCE).digest('hex');
async function writeTrustedAsset(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.');
  // The released loader checks a directory's server entry before its default
  // entry. No unverified fallback entry may execute before the API config gate.
  for (const name of await fs.readdir(directory)) if (!['package.json', 'index.mjs'].includes(name)) throw new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.');
  for (const [name, content] of [['package.json', JSON.stringify({ name: 'aura-task-list', type: 'module', exports: './index.mjs' })], ['index.mjs', SOURCE]]) {
    const target = path.join(directory, name);
    const existing = await fs.lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.');
    // A crash residue must not become a loader entry or prevent the next start.
    // The private parent is not a plugin/config discovery directory.
    const temporary = path.join(path.dirname(directory), `.aura-task-list-${name}.${randomUUID()}`);
    await fs.writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
    try { await fs.rename(temporary, target); } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  if (createHash('sha256').update(await fs.readFile(path.join(directory, 'index.mjs'))).digest('hex') !== SHA256) throw new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.');
}
module.exports = { SOURCE, SHA256, writeTrustedAsset };
