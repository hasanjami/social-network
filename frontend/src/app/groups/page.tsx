"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import {
  fetchGroups,
  joinGroup,
  type GroupListItem,
} from "@/app/lib/api/groups";
import { useToast } from "@/contexts/toastContext";

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const { showError, showSuccess, showInfo } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchGroups({ q: query.trim() || undefined, limit: 50 });
      setGroups(list);
    } catch (e) {
      console.error(e);
      showError("Groups", "Could not load groups.");
    } finally {
      setLoading(false);
    }
  }, [query, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (g: GroupListItem) => {
    if (g.privacy === "private") return;
    setJoiningId(g.id);
    try {
      const out = await joinGroup(g.id);
      if (out.alreadyMember) {
        showInfo(
          "Group",
          `Already in this group (${out.status || "member"}).`
        );
      } else {
        showSuccess("Group", "Join request sent.");
      }
      await load();
    } catch (e) {
      showError("Join", e instanceof Error ? e.message : "Join failed.");
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Browse groups</h1>
              <p className="mt-1 text-sm text-gray-600">
                All groups are listed here. Private groups can only be joined by invitation (no open join).
              </p>
            </div>
            <Link
              href="/groups/new"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create group
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="search"
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => load()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Search
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="text-gray-500 text-sm">No groups found.</p>
          ) : (
            <ul className="space-y-4">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/groups/${g.id}`}
                        className="text-lg font-semibold text-gray-900 hover:text-indigo-700"
                      >
                        {g.name}
                      </Link>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          g.privacy === "private"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {g.privacy === "private" ? "Private" : "Public"}
                      </span>
                    </div>
                    {g.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">{g.description}</p>
                    )}
                    {g.isMember && (
                      <p className="mt-2 text-xs text-gray-500">
                        Your status:{" "}
                        <span className="font-medium text-gray-700">
                          {g.memberStatus === "accepted"
                            ? "Member"
                            : g.memberStatus === "pending"
                              ? "Pending"
                              : g.memberStatus || "Member"}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                    <Link
                      href={`/groups/${g.id}`}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      View
                    </Link>
                    {g.privacy === "private" ? (
                      <div className="text-right">
                        <p className="text-xs text-amber-800 font-medium">Invite only</p>
                        <p className="text-xs text-gray-500 max-w-xs">
                          Open join is not available. Ask the creator for an invitation.
                        </p>
                      </div>
                    ) : g.isMember && g.memberStatus === "accepted" ? (
                      <span className="text-sm text-gray-600 text-right">You are a member</span>
                    ) : g.isMember && g.memberStatus === "pending" ? (
                      <span className="text-sm text-amber-700 text-right">Request pending</span>
                    ) : (
                      <button
                        type="button"
                        disabled={joiningId === g.id}
                        onClick={() => handleJoin(g)}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {joiningId === g.id ? "Sending..." : "Request to join"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
