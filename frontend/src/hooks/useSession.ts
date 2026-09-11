import { useEffect, useState } from "react";
import { client, type Client, type Project, type User } from "../api";

const EMPTY_CLIENTS: Client[] = [];
const EMPTY_PROJECTS: Project[] = [];

export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    client
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);
  return { user, setUser };
}

export function useClients(enabled = true) {
  const [clients, setClients] = useState<Client[]>([]);
  const reload = () => client.clients().then((r) => setClients(r.clients));
  useEffect(() => {
    if (!enabled) {
      setClients((prev) => (prev.length === 0 ? prev : EMPTY_CLIENTS));
      return;
    }
    void reload();
  }, [enabled]);
  return { clients, reload };
}

export function useAllProjects(enabled = true) {
  const [projects, setProjects] = useState<Project[]>(EMPTY_PROJECTS);
  useEffect(() => {
    if (!enabled) {
      setProjects(EMPTY_PROJECTS);
      return;
    }
    let cancelled = false;
    void client.projects().then((r) => {
      if (cancelled) return;
      const next = r.projects;
      setProjects((prev) => {
        if (prev.length === next.length && prev.every((p, i) => p.id === next[i]?.id)) return prev;
        return next.length === 0 ? EMPTY_PROJECTS : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return projects;
}
