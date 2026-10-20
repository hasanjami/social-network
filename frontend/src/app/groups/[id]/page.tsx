"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import GroupPostCard from "@/components/groups/GroupPostCard";
import GroupEventsSection from "@/components/groups/GroupEventsSection";
import { useAuth } from "@/contexts/authContext";
import { useToast } from "@/contexts/toastContext";
import { useConfirm } from "@/contexts/confirmContext";
import {
  acceptGroupAction,
  declineGroupAction,
  deleteGroup,
  fetchGroup,
  fetchGroupMembers,
  fetchUserMini,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  updateGroup,
  type GroupMemberRow,
  type GroupPrivacy,
  type GroupWithDetails,
} from "@/app/lib/api/groups";
import { createPost, fetchGroupPosts, type GroupPostItem } from "@/app/lib/api/posts";
import { searchUsers } from "@/app/lib/api/user";
import type { User } from "@/app/lib/api/auth";

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { showError, showSuccess, showInfo } = useToast();
  const confirm = useConfirm();

  const groupId = useMemo(() => {
    const raw = params?.id;
    const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params?.id]);

  const [group, setGroup] = useState<GroupWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<GroupPostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [pendingRows, setPendingRows] = useState<GroupMemberRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Record<number, string>>({});
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteHits, setInviteHits] = useState<User[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postSubmitting, setPostSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrivacy, setEditPrivacy] = useState<GroupPrivacy>("public");
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const loadGroup = useCallback(async () => {
    if (groupId == null) return;
    setLoading(true);
    try {
      const g = await fetchGroup(groupId);
      setGroup(g);
      if (g) {
        setEditName(g.name);
        setEditDesc(g.description ?? "");
        setEditPrivacy((g.privacy as GroupPrivacy) || "public");
      }
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Could not load group.");
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, showError]);

  const loadPosts = useCallback(async () => {
    if (groupId == null) return;
    setPostsLoading(true);
    try {
      const list = await fetchGroupPosts(groupId);
      setPosts(list);
    } catch (e) {
      setPosts([]);
      showError("Posts", e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      setPostsLoading(false);
    }
  }, [groupId, showError]);

  const loadPendingMembers = useCallback(async () => {
    if (groupId == null || !user?.id) return;
    try {
      const rows = await fetchGroupMembers(groupId, "pending");
      setPendingRows(rows);
      const ids = [...new Set(rows.map((r) => r.userId))];
      const entries = await Promise.all(
        ids.map(async (id) => {
          const u = await fetchUserMini(id);
          const label = u
            ? u.username
              ? `@${u.username}`
              : `${u.firstName} ${u.lastName}`.trim()
            : `#${id}`;
          return [id, label] as const;
        })
      );
      setPendingUsers(Object.fromEntries(entries));

      // Also fetch accepted members to prevent inviting existing members
      const acceptedRows = await fetchGroupMembers(groupId, "accepted");
      const allMemberIds = new Set([
        ...rows.map((r) => r.userId),
        ...acceptedRows.map((r) => r.userId),
      ]);
      setMemberIds(allMemberIds);
    } catch {
      setPendingRows([]);
    }
  }, [groupId, user?.id]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const accepted =
    !!group?.isMember && group.memberStatus === "accepted";
  const pendingMembership =
    !!group?.isMember && group.memberStatus === "pending";

  useEffect(() => {
    if (!groupId || !accepted) return;
    loadPosts();
  }, [groupId, accepted, loadPosts]);

  useEffect(() => {
    if (!groupId || !user?.id) return;
    if (!accepted && !pendingMembership) return;
    loadPendingMembers();
  }, [groupId, user?.id, accepted, pendingMembership, loadPendingMembers]);

  useEffect(() => {
    const q = inviteQuery.trim();
    if (q.length < 2) {
      setInviteHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const hits = await searchUsers(q);
      setInviteHits(hits.filter((u) => u.id !== user?.id));
    }, 300);
    return () => clearTimeout(t);
  }, [inviteQuery, user?.id, memberIds]);

  const myPendingRow = pendingRows.find((r) => r.userId === user?.id);
  const joinRequestsForCreator = pendingRows.filter(
    (r) => r.requestType === "join_request"
  );

  const handleJoin = async () => {
    if (groupId == null) return;
    try {
      const out = await joinGroup(groupId);
      if (out.alreadyMember) {
        showInfo("Group", `Already in this group (${out.status || "member"}).`);
      } else {
        showSuccess("Group", "Join request sent.");
      }
      await loadGroup();
    } catch (e) {
      showError("Join", e instanceof Error ? e.message : "Join failed.");
    }
  };

  const handleInvite = async (target: User) => {
    if (groupId == null) return;
    setInviteBusy(true);
    try {
      await inviteToGroup(groupId, target.id);
      showSuccess("Invite", `Invitation sent to @${target.username}.`);
      setInviteQuery("");
      setInviteHits([]);
      await loadPendingMembers();
    } catch (e) {
      showError("Invite", e instanceof Error ? e.message : "Invite failed.");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleAcceptSelfInvitation = async () => {
    if (groupId == null) return;
    setActionBusy(-1);
    try {
      await acceptGroupAction(groupId);
      showSuccess("Group", "You joined the group.");
      await loadGroup();
      await loadPendingMembers();
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Could not accept.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeclineSelfInvitation = async () => {
    if (groupId == null) return;
    setActionBusy(-2);
    try {
      await declineGroupAction(groupId);
      showInfo("Group", "Invitation declined.");
      await loadGroup();
      await loadPendingMembers();
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Could not decline.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleCreatorDecision = async (
    row: GroupMemberRow,
    accept: boolean
  ) => {
    if (groupId == null) return;
    setActionBusy(row.userId);
    try {
      if (accept) {
        await acceptGroupAction(groupId, { userId: row.userId });
        showSuccess("Group", "Join request accepted.");
      } else {
        await declineGroupAction(groupId, { userId: row.userId });
        showInfo("Group", "Join request declined.");
      }
      await loadPendingMembers();
      await loadGroup();
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleNewPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !postTitle.trim() || !postBody.trim()) return;
    setPostSubmitting(true);
    try {
      await createPost({
        title: postTitle.trim(),
        content: postBody.trim(),
        privacy: "public",
        group_id: groupId,
      });
      setPostTitle("");
      setPostBody("");
      await loadPosts();
      showSuccess("Post", "Published to the group.");
    } catch (e) {
      showError("Post", e instanceof Error ? e.message : "Could not create post.");
    } finally {
      setPostSubmitting(false);
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (groupId == null || !editName.trim()) return;
    setSavingGroup(true);
    try {
      await updateGroup(groupId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        privacy: editPrivacy,
      });
      showSuccess("Group", "Saved.");
      setEditOpen(false);
      await loadGroup();
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (groupId == null) return;
    const ok = await confirm({
      title: "Delete this group?",
      body: "This permanently removes the group and all its posts.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingGroup(true);
    try {
      await deleteGroup(groupId);
      showSuccess("Group", "Group deleted.");
      router.push("/groups");
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleLeave = async () => {
    if (groupId == null) return;
    const ok = await confirm({
      title: "Leave this group?",
      confirmText: "Leave",
      destructive: true,
    });
    if (!ok) return;
    setLeaveBusy(true);
    try {
      await leaveGroup(groupId);
      showInfo("Group", "You left the group.");
      router.push("/groups");
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Could not leave.");
    } finally {
      setLeaveBusy(false);
    }
  };

  if (groupId == null) {
    return (
      <ProtectedRoute requireAuth={true}>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <main className="max-w-4xl mx-auto py-8 px-4">
            <p className="text-sm text-gray-600">Invalid group link.</p>
            <Link href="/groups" className="text-indigo-600 text-sm mt-2 inline-block">
              Back to groups
            </Link>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/groups"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              back  Browse groups
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
            </div>
          ) : !group ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-gray-700">Group not found.</p>
              <Link
                href="/groups"
                className="mt-4 inline-block text-indigo-600 text-sm font-medium"
              >
                Back to groups
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold text-gray-900">{group.name}</h1>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        group.privacy === "private"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {group.privacy === "private" ? "Private" : "Public"}
                    </span>
                  </div>
                  {group.description && (
                    <p className="mt-2 text-gray-600">{group.description}</p>
                  )}
                  <p className="mt-2 text-sm text-gray-500">
                    {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                    {group.creator && (
                      <>
                        {" "}
                        - Created by{" "}
                        <span className="font-medium text-gray-700">
                          @{group.creator.username}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {group.isCreator && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditOpen((v) => !v)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        {editOpen ? "Close edit" : "Edit group"}
                      </button>
                      <button
                        type="button"
                        disabled={deletingGroup}
                        onClick={handleDeleteGroup}
                        className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingGroup ? "..." : "Delete"}
                      </button>
                    </>
                  )}
                  {accepted && !group.isCreator && (
                    <button
                      type="button"
                      disabled={leaveBusy}
                      onClick={handleLeave}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {leaveBusy ? "..." : "Leave group"}
                    </button>
                  )}
                </div>
              </div>

              {editOpen && group.isCreator && (
                <form
                  onSubmit={handleSaveGroup}
                  className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <h2 className="text-sm font-semibold text-gray-900">Edit details</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      required
                      minLength={3}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Description</label>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Privacy</label>
                    <select
                      value={editPrivacy}
                      onChange={(e) =>
                        setEditPrivacy(e.target.value as GroupPrivacy)
                      }
                      className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={savingGroup}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingGroup ? "Saving..." : "Save"}
                  </button>
                </form>
              )}

              {!group.isMember && group.privacy === "public" && (
                <div className="mb-6 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  You are not a member yet.{" "}
                  <button
                    type="button"
                    onClick={handleJoin}
                    className="font-semibold underline hover:no-underline"
                  >
                    Request to join
                  </button>
                </div>
              )}

              {!group.isMember && group.privacy === "private" && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This group is private. Ask @{group.creator?.username || "the creator"}{" "}
                  for an invitation.
                </div>
              )}

              {pendingMembership &&
                myPendingRow?.requestType === "invitation" && (
                  <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="text-sm text-gray-800 font-medium">
                      You have been invited to this group.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={handleAcceptSelfInvitation}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionBusy === -1 ? "..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={handleDeclineSelfInvitation}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionBusy === -2 ? "..." : "Decline"}
                      </button>
                    </div>
                  </div>
                )}

              {pendingMembership &&
                myPendingRow?.requestType === "join_request" && (
                  <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-700">
                    Your join request is pending the creator's approval.
                  </div>
                )}

              {accepted && group.isCreator && joinRequestsForCreator.length > 0 && (
                <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Pending join requests
                  </h2>
                  <ul className="mt-3 divide-y divide-gray-100">
                    {joinRequestsForCreator.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
                      >
                        <span className="text-sm text-gray-800">
                          {pendingUsers[row.userId] || `User #${row.userId}`}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => handleCreatorDecision(row, true)}
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionBusy === row.userId ? "..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => handleCreatorDecision(row, false)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {accepted && (
                <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900">Invite someone</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Search by username or name. They will receive a notification.
                  </p>
                  <input
                    type="search"
                    value={inviteQuery}
                    onChange={(e) => setInviteQuery(e.target.value)}
                    placeholder="Search users..."
                    className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  {inviteHits.length > 0 && (
                    <ul className="mt-2 max-h-40 overflow-auto rounded-md border border-gray-100 bg-gray-50">
                      {inviteHits.map((u) => {
                        const alreadyMember = memberIds.has(u.id);
                        return (
                          <li
                            key={u.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <span>
                              @{u.username}{" "}
                              <span className="text-gray-500">
                                {u.firstName} {u.lastName}
                              </span>
                            </span>
                            {alreadyMember ? (
                              <span className="text-xs text-gray-400 font-medium">
                                Already in group
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={inviteBusy}
                                onClick={() => handleInvite(u)}
                                className="text-indigo-600 text-xs font-medium hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Invite
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {accepted && user && (
                <form
                  onSubmit={handleNewPost}
                  className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <h2 className="text-lg font-semibold text-gray-900">New group post</h2>
                  <input
                    placeholder="Title"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                  <textarea
                    placeholder="What is on your mind?"
                    value={postBody}
                    onChange={(e) => setPostBody(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={postSubmitting}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {postSubmitting ? "Publishing..." : "Publish"}
                  </button>
                </form>
              )}

              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Posts</h2>
                {postsLoading ? (
                  <p className="text-sm text-gray-500">Loading posts...</p>
                ) : !accepted ? (
                  <p className="text-sm text-gray-500">
                    Posts are visible to accepted members only.
                  </p>
                ) : posts.length === 0 ? (
                  <p className="text-sm text-gray-500">No posts yet.</p>
                ) : (
                  <div className="space-y-6">
                    {posts.map((item) => (
                      <GroupPostCard
                        key={item.post.id}
                        item={item}
                        groupCreatorId={group.creatorId}
                        currentUserId={user!.id}
                        onPostDeleted={() => loadPosts()}
                      />
                    ))}
                  </div>
                )}
              </section>

              {accepted && <GroupEventsSection groupId={groupId} />}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
