"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Download, FilePenLine, FileText, Folder, FolderPlus, FolderTree, RefreshCcw, RotateCcw, Trash2, Upload, X } from "lucide-react";

import { api } from "@/lib/api";
import type { ChannelSummary, FileEntry, UploadQueueItem } from "@/lib/types";

type FileDialogTarget = { item: FileEntry; fullPath: string };
type DeleteImpact = { files: number; folders: number; paths: string[] };

type Props = {
  channels: ChannelSummary[];
  files: FileEntry[];
  currentPath: string;
  selectedChannelId: number;
  uploading: boolean;
  uploadQueue: UploadQueueItem[];
  onRefresh: () => void;
  onSelectChannel: (channelId: number) => void;
  onNavigate: (folderPath: string) => void;
  onUpload: (files: FileList | null) => Promise<void>;
  onRetry: (item: UploadQueueItem) => Promise<void>;
  onRemove: (id: string) => void;
};

export function FileTransferPanel({ channels, files, currentPath, selectedChannelId, uploading, uploadQueue, onRefresh, onSelectChannel, onNavigate, onUpload, onRetry, onRemove }: Props) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileDialogTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileDialogTarget | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [channelFileCounts, setChannelFileCounts] = useState<Record<number, number>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sortedFiles = useMemo(
    () =>
      [...files].sort((left, right) => {
        if (left.type !== right.type) return left.type - right.type;
        return left.name.localeCompare(right.name);
      }),
    [files],
  );
  const canGoUp = currentPath !== "/";

  useEffect(() => {
    void refreshChannelFileCounts();
  }, [channels]);

  useEffect(() => {
    if (selectedChannelId <= 0 || currentPath !== "/") return;
    setChannelFileCounts((current) => ({
      ...current,
      [selectedChannelId]: files.length,
    }));
  }, [currentPath, files, selectedChannelId]);

  async function refreshChannelFileCounts() {
    if (!channels.length) {
      setChannelFileCounts({});
      return;
    }

    const entries = await Promise.all(
      channels.map(async (channel) => {
        try {
          const items = await api.getFiles(channel.id, "/");
          return [channel.id, items.length] as const;
        } catch {
          return [channel.id, 0] as const;
        }
      }),
    );

    setChannelFileCounts(Object.fromEntries(entries));
  }

  async function refreshSelectedChannelCount() {
    if (selectedChannelId <= 0) return;

    try {
      const rootItems = currentPath === "/" ? files : await api.getFiles(selectedChannelId, "/");
      setChannelFileCounts((current) => ({
        ...current,
        [selectedChannelId]: rootItems.length,
      }));
    } catch {
      return;
    }
  }

  async function handleRefresh() {
    onRefresh();
    await refreshSelectedChannelCount();
  }

  async function handleUploadSelection(fileList: FileList | null) {
    await onUpload(fileList);
    await refreshSelectedChannelCount();
  }

  async function handleRetry(item: UploadQueueItem) {
    await onRetry(item);
    await refreshSelectedChannelCount();
  }

  async function collectDeleteImpact(target: FileDialogTarget): Promise<DeleteImpact> {
    if (target.item.type === 1) {
      return { files: 1, folders: 0, paths: [target.fullPath] };
    }

    const summary: DeleteImpact = { files: 0, folders: 1, paths: [target.fullPath] };
    const children = await api.getFiles(selectedChannelId, target.fullPath);
    for (const child of children) {
      const childPath = joinVirtualPath(child.path, child.name);
      if (child.type === 0) {
        const nested = await collectDeleteImpact({ item: child, fullPath: childPath });
        summary.files += nested.files;
        summary.folders += nested.folders;
        summary.paths.push(...nested.paths);
      } else {
        summary.files += 1;
        summary.paths.push(childPath);
      }
    }

    return summary;
  }

  function openRenameDialog(item: FileEntry) {
    setRenameError(null);
    setRenameTarget({ item, fullPath: joinVirtualPath(item.path, item.name) });
    setRenameValue(item.name);
  }

  async function openDeleteDialog(item: FileEntry) {
    const target = { item, fullPath: joinVirtualPath(item.path, item.name) };
    setDeleteError(null);
    setDeleteTarget(target);
    setDeleteImpact(null);
    setDialogBusy(true);
    try {
      setDeleteImpact(await collectDeleteImpact(target));
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "检查删除影响失败。");
    } finally {
      setDialogBusy(false);
    }
  }

  async function submitCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newFolderName.trim()) return;

    setCreateError(null);
    setDialogBusy(true);
    try {
      await api.createDirectory(selectedChannelId, joinVirtualPath(currentPath, newFolderName.trim()));
      setCreateDialogOpen(false);
      setNewFolderName("");
      onRefresh();
      await refreshSelectedChannelCount();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "创建文件夹失败。");
    } finally {
      setDialogBusy(false);
    }
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;

    setRenameError(null);
    setDialogBusy(true);
    try {
      await api.renameFile(selectedChannelId, renameTarget.fullPath, joinVirtualPath(renameTarget.item.path, renameValue.trim()));
      setRenameTarget(null);
      setRenameValue("");
      onRefresh();
      await refreshSelectedChannelCount();
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : "重命名项目失败。");
    } finally {
      setDialogBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleteError(null);
    setDialogBusy(true);
    try {
      await api.deleteFile(selectedChannelId, deleteTarget.fullPath);
      setDeleteTarget(null);
      setDeleteImpact(null);
      onRefresh();
      await refreshSelectedChannelCount();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "删除项目失败。");
    } finally {
      setDialogBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[0.34fr_0.66fr]">
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
            <FolderTree className="h-4 w-4 text-cyan-300" />
            频道列表
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-auto pr-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => onSelectChannel(channel.id)}
                className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition ${selectedChannelId === channel.id ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]"}`}
              >
                <span className="truncate">{channel.name}</span>
                <span className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-[11px] ${selectedChannelId === channel.id ? "bg-cyan-400/20 text-cyan-100" : "bg-white/8 text-slate-400"}`}>
                  {channelFileCounts[channel.id] ?? 0}
                </span>
              </button>
            ))}
            {!channels.length ? <EmptyState label="未找到频道。" /> : null}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">频道文件浏览器</div>
                <div className="mt-1 text-xs text-slate-400">路径 {currentPath}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={smallSecondaryButtonClassName} type="button" onClick={() => onNavigate(parentVirtualPath(currentPath))} disabled={!canGoUp}>
                  返回上级
                </button>
                <button className={smallSecondaryButtonClassName} type="button" onClick={() => void handleRefresh()}>
                  <RefreshCcw className="h-4 w-4" />
                  刷新
                </button>
                <button
                  className={smallSecondaryButtonClassName}
                  type="button"
                  onClick={() => {
                    setCreateDialogOpen(true);
                    setNewFolderName("");
                    setCreateError(null);
                  }}
                  disabled={selectedChannelId <= 0}
                >
                  <FolderPlus className="h-4 w-4" />
                  新建文件夹
                </button>
                <label className={`${smallSecondaryButtonClassName} cursor-pointer ${selectedChannelId <= 0 ? "opacity-60" : ""}`}>
                  <Upload className="h-4 w-4" />
                  {uploading ? "上传中..." : "添加文件"}
                  <input
                    className="hidden"
                    disabled={selectedChannelId <= 0}
                    type="file"
                    multiple
                    onChange={(event) => {
                      void handleUploadSelection(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="overflow-auto rounded-3xl border border-white/8">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950/85 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">名称</th>
                    <th className="px-4 py-3">类型</th>
                    <th className="px-4 py-3">大小</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiles.map((item) => {
                    const fullPath = joinVirtualPath(item.path, item.name);
                    return (
                      <tr key={`${item.path}-${item.name}-${item.datetime}`} className="border-t border-white/6 text-slate-200">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-left"
                            onClick={() => {
                              if (item.type === 0) onNavigate(fullPath);
                            }}
                          >
                            <span className="rounded-xl border border-white/10 bg-white/[0.03] p-2">{item.type === 0 ? <Folder className="h-4 w-4 text-cyan-300" /> : <FileText className="h-4 w-4 text-slate-300" />}</span>
                            <span>{item.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{item.type === 0 ? "文件夹" : "文件"}</td>
                        <td className="px-4 py-3 text-slate-400">{item.type === 0 ? "--" : formatBytes(item.size)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {item.type === 1 ? (
                              <a className={smallSecondaryButtonClassName} href={api.getFileDownloadUrl(selectedChannelId, fullPath)}>
                                <Download className="h-4 w-4" />
                                下载
                              </a>
                            ) : null}
                            <button className={smallSecondaryButtonClassName} type="button" onClick={() => openRenameDialog(item)}>
                              <FilePenLine className="h-4 w-4" />
                              重命名
                            </button>
                            <button className={smallSecondaryButtonClassName} type="button" onClick={() => void openDeleteDialog(item)}>
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!sortedFiles.length ? <EmptyState label="当前路径下没有文件。" /> : null}
            </div>
          </div>
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-3 text-sm font-medium text-white">上传队列</div>
            <div className="space-y-3">
              {uploadQueue.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white">{item.fileName}</div>
                      <div className="mt-1 text-xs text-slate-400">{formatBytes(item.size)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
                      {item.status === "error" ? <AlertCircle className="h-4 w-4 text-rose-300" /> : null}
                      {item.status === "error" ? (
                        <button className={smallSecondaryButtonClassName} type="button" onClick={() => void handleRetry(item)}>
                          <RotateCcw className="h-4 w-4" />
                          重试
                        </button>
                      ) : null}
                      <button className={smallSecondaryButtonClassName} type="button" onClick={() => onRemove(item.id)}>
                        移除
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${item.status === "error" ? "bg-rose-400" : item.status === "success" ? "bg-emerald-400" : "bg-cyan-400"}`} style={{ width: `${item.progress}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{getStatusLabel(item.status)}</span>
                    <span className="text-slate-300">{item.progress}%</span>
                  </div>
                  {item.error ? <div className="mt-2 text-xs text-rose-200">{item.error}</div> : null}
                </div>
              ))}
              {!uploadQueue.length ? <EmptyState label="当前没有排队上传项。" /> : null}
            </div>
          </div>
        </div>
      </div>

      <ModalFrame
        open={createDialogOpen}
        title="创建文件夹"
        onClose={() => {
          if (!dialogBusy) {
            setCreateDialogOpen(false);
            setCreateError(null);
          }
        }}
      >
        <form className="space-y-4" onSubmit={submitCreateFolder}>
          <Input label="文件夹名称">
            <input className={inputClassName} value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} autoFocus />
          </Input>
          {createError ? <DialogError message={createError} /> : null}
          <div className="flex justify-end gap-2">
            <button
              className={smallSecondaryButtonClassName}
              type="button"
              onClick={() => {
                setCreateDialogOpen(false);
                setCreateError(null);
              }}
              disabled={dialogBusy}
            >
              取消
            </button>
            <button className={primaryButtonClassName} type="submit" disabled={dialogBusy || !newFolderName.trim()}>
              创建
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame
        open={!!renameTarget}
        title={renameTarget?.item.type === 0 ? "重命名文件夹" : "重命名文件"}
        onClose={() => {
          if (!dialogBusy) {
            setRenameTarget(null);
            setRenameError(null);
          }
        }}
      >
        <form className="space-y-4" onSubmit={submitRename}>
          <Input label="新名称">
            <input className={inputClassName} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
          </Input>
          {renameError ? <DialogError message={renameError} /> : null}
          <div className="flex justify-end gap-2">
            <button
              className={smallSecondaryButtonClassName}
              type="button"
              onClick={() => {
                setRenameTarget(null);
                setRenameError(null);
              }}
              disabled={dialogBusy}
            >
              取消
            </button>
            <button className={primaryButtonClassName} type="submit" disabled={dialogBusy || !renameValue.trim()}>
              保存
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame
        open={!!deleteTarget}
        title={deleteTarget?.item.type === 0 ? "删除文件夹" : "删除文件"}
        onClose={() => {
          if (!dialogBusy) {
            setDeleteTarget(null);
            setDeleteImpact(null);
            setDeleteError(null);
          }
        }}
      >
        <div className="space-y-4">
          {deleteImpact ? (
            <>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                将删除 {deleteImpact.files} 个文件和 {deleteImpact.folders} 个文件夹。
              </div>
              <div className="max-h-64 space-y-2 overflow-auto rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                {deleteImpact.paths.slice(0, 12).map((targetPath) => (
                  <div key={targetPath} className="truncate text-xs text-slate-300">
                    {targetPath}
                  </div>
                ))}
                {deleteImpact.paths.length > 12 ? <div className="text-xs text-slate-500">另有 {deleteImpact.paths.length - 12} 项</div> : null}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400">正在计算受影响文件...</div>
          )}
          {deleteError ? <DialogError message={deleteError} /> : null}
          <div className="flex justify-end gap-2">
            <button
              className={smallSecondaryButtonClassName}
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteImpact(null);
                setDeleteError(null);
              }}
              disabled={dialogBusy}
            >
              取消
            </button>
            <button className={smallDangerButtonClassName} type="button" onClick={() => void confirmDelete()} disabled={dialogBusy || !deleteImpact}>
              删除
            </button>
          </div>
        </div>
      </ModalFrame>
    </>
  );
}

function ModalFrame({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4"><div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-slate-950 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-4"><h3 className="text-lg font-semibold text-white">{title}</h3><button className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10" type="button" onClick={onClose}><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

function joinVirtualPath(basePath: string, name: string) {
  const prefix = basePath === "/" ? "" : basePath.replace(/\/$/, "");
  return `${prefix}/${name}`;
}

function parentVirtualPath(currentPath: string) {
  if (currentPath === "/") return "/";
  const segments = currentPath.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join("/")}` : "/";
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return "0 字节";
  const units = ["字节", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(decimals)} ${units[index]}`;
}

function getStatusLabel(status: UploadQueueItem["status"]) {
  if (status === "queued") return "排队中";
  if (status === "uploading") return "上传中";
  if (status === "success") return "已完成";
  return "失败";
}

function Input({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-slate-300">{label}</span>{children}</label>; }
function EmptyState({ label }: { label: string }) { return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">{label}</div>; }
function DialogError({ message }: { message: string }) { return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{message}</div>; }

const inputClassName = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20";
const primaryButtonClassName = "inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300";
const smallSecondaryButtonClassName = "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100";
const smallDangerButtonClassName = "inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100";
