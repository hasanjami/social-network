"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import { createGroup, type GroupPrivacy } from "@/app/lib/api/groups";
import { useToast } from "@/contexts/toastContext";

export default function NewGroupPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<GroupPrivacy>("public");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const out = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        privacy,
      });
      const id = out.group?.id;
      showSuccess("Group", "Group created.");
      if (id) router.push(`/groups/${id}`);
      else router.push("/groups");
    } catch (e) {
      showError("Group", e instanceof Error ? e.message : "Could not create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/groups"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              back  Browse groups
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Create a group</h1>
            <p className="mt-2 text-gray-600 text-sm">
              You will be the creator and an accepted member automatically.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="e.g. Weekend hikers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="What is this group about?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Privacy</label>
              <select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as GroupPrivacy)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              >
                <option value="public">Public - anyone can request to join</option>
                <option value="private">Private - invite only</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating..." : "Create group"}
              </button>
              <Link
                href="/groups"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </main>
      </div>
    </ProtectedRoute>
  );
}
