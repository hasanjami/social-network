"use client";

import { useEffect, useState } from "react";
import {
  GroupEvent,
  fetchGroupEvents,
  createGroupEvent,
  respondToEvent,
} from "@/app/lib/api/groups";

interface GroupEventsSectionProps {
  groupId: number;
}

export default function GroupEventsSection({ groupId }: GroupEventsSectionProps) {
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const list = await fetchGroupEvents(groupId);
    setEvents(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !date) {
      setError("title and date are required");
      return;
    }

    const iso = new Date(date).toISOString();
    setSubmitting(true);
    const created = await createGroupEvent(groupId, title.trim(), description.trim(), iso);
    setSubmitting(false);

    if (!created) {
      setError("failed to create event");
      return;
    }

    setTitle("");
    setDescription("");
    setDate("");
    setShowForm(false);
    load();
  };

  const handleRespond = async (eventId: number, response: "going" | "not_going") => {
    if (await respondToEvent(eventId, response)) {
      load();
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Events</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          {showForm ? "Cancel" : "New event"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 mb-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create event"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500">No events yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="bg-white rounded-lg shadow p-4">
              <h3 className="text-base font-semibold text-gray-900">{e.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{formatDate(e.eventDate)}</p>
              {e.description && (
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{e.description}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleRespond(e.id, "going")}
                  className={`px-3 py-1 text-sm rounded-md ${
                    e.myResponse === "going"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Going ({e.going})
                </button>
                <button
                  onClick={() => handleRespond(e.id, "not_going")}
                  className={`px-3 py-1 text-sm rounded-md ${
                    e.myResponse === "not_going"
                      ? "bg-gray-700 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Not going ({e.notGoing})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
