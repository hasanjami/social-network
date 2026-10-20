"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import {
  fetchNotifications,
  labelForNotificationType,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/app/lib/api/notifications";
import { useToast } from "@/contexts/toastContext";

function linkForNotification(n: AppNotification): string | null {
  const t = n.type;
  if (
    t.startsWith("group_") ||
    t === "group"
  ) {
    return `/groups/${n.objectId}`;
  }
  if (t === "follow_request") return "/follow-requests";
  return null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { showError } = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchNotifications();
      setItems(list);
    } catch (e) {
      showError("Notifications", e instanceof Error ? e.message : "Could not load.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
        );
      } catch {
        /* still navigate */
      }
    }
    const href = linkForNotification(n);
    if (href) router.push(href);
  };

  const handleMarkAll = async () => {
    setMarking(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    } catch (e) {
      showError("Notifications", e instanceof Error ? e.message : "Failed.");
    } finally {
      setMarking(false);
    }
  };

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              <p className="mt-2 text-gray-600 text-sm">
                Group invites, join requests, and other activity
              </p>
            </div>
            {items.some((n) => !n.isRead) && (
              <button
                type="button"
                disabled={marking}
                onClick={handleMarkAll}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {marking ? "..." : "Mark all read"}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
              <p className="text-gray-600">No notifications yet.</p>
              <Link
                href="/home"
                className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Back to home
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((n) => {
                const href = linkForNotification(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className={`w-full text-left rounded-lg border p-4 shadow-sm transition-colors ${
                        n.isRead
                          ? "border-gray-200 bg-white"
                          : "border-indigo-200 bg-indigo-50/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                          {labelForNotificationType(n.type)}
                        </span>
                        {!n.isRead && (
                          <span className="text-xs font-semibold text-indigo-700">New</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-gray-800">{n.content}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {new Date(n.createdAt).toLocaleString()}
                        {href && (
                          <span className="text-indigo-600 ml-2">
                            {href.startsWith("/groups") ? "Open group" : "Open"}
                          </span>
                        )}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
