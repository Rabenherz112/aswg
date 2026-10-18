// Client-side roadmap persistence and status management.
(function() {
    const STORAGE_KEY = 'aswg-roadmap-v1';
    const EVENT_NAME = 'roadmap:changed';
    const MAX_STATUSES = 6;
    const DEFAULT_STATUSES = [
        { id: 'todo', label: 'Todo', order: 0, builtin: true },
        { id: 'in_stack', label: 'In Stack', order: 1, builtin: true },
        { id: 'not_interested', label: 'Not Interested', order: 2, builtin: true }
    ];

    /**
     * Create a slug-like id from a label.
     */
    function slugifyStatusId(label) {
        return String(label || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'status';
    }

    /**
     * Return a deep clone of JSON-safe data.
     */
    function cloneJson(data) {
        return JSON.parse(JSON.stringify(data));
    }

    /**
     * Roadmap store wrapper around localStorage with in-memory fallback.
     */
    class RoadmapStore {
        constructor() {
            this.memoryState = null;
            this.storageAvailable = this.testStorage();
            this.ensureInitialized();
        }

        /**
         * Dispatch roadmap update event to the page.
         */
        notifyChange() {
            window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: this.getState() }));
        }

        /**
         * Verify localStorage write/read support.
         */
        testStorage() {
            try {
                const testKey = '__aswg_roadmap_test__';
                localStorage.setItem(testKey, '1');
                localStorage.removeItem(testKey);
                return true;
            } catch (error) {
                console.warn('[roadmap] localStorage unavailable, using memory fallback');
                return false;
            }
        }

        /**
         * Return default state payload.
         */
        defaultState() {
            return {
                version: 1,
                updated_at: new Date().toISOString(),
                statuses: cloneJson(DEFAULT_STATUSES),
                items: {},
                removed_items: {}
            };
        }

        /**
         * Load and normalize state.
         */
        getState() {
            const raw = this.storageAvailable ? localStorage.getItem(STORAGE_KEY) : this.memoryState;
            if (!raw) return this.defaultState();

            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return this.normalizeState(parsed);
            } catch (error) {
                console.warn('[roadmap] invalid state found, resetting');
                return this.defaultState();
            }
        }

        /**
         * Persist normalized state.
         */
        saveState(nextState) {
            return this.persistState(nextState);
        }

        /**
         * Persist normalized state with optional timestamp/event behavior.
         */
        persistState(nextState, options) {
            const cfg = options || {};
            const normalized = this.normalizeState(nextState);
            if (cfg.touchUpdatedAt !== false) normalized.updated_at = new Date().toISOString();
            if (this.storageAvailable) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            } else {
                this.memoryState = cloneJson(normalized);
            }
            if (cfg.notify !== false) this.notifyChange();
            return normalized;
        }

        /**
         * Normalize and sanitize roadmap state.
         */
        normalizeState(state) {
            const safe = state && typeof state === 'object' ? state : {};
            const statuses = Array.isArray(safe.statuses) ? safe.statuses : cloneJson(DEFAULT_STATUSES);
            const normalizedStatuses = statuses
                .map((status, index) => ({
                    id: slugifyStatusId(status.id || status.label || ('status_' + index)),
                    label: String(status.label || status.id || ('Status ' + (index + 1))),
                    order: Number.isInteger(status.order) ? status.order : index,
                    builtin: Boolean(status.builtin)
                }))
                .sort((a, b) => a.order - b.order)
                .filter((status, index, arr) => arr.findIndex(item => item.id === status.id) === index);

            const validStatusIds = new Set(normalizedStatuses.map(status => status.id));
            const items = {};
            const sourceItems = safe.items && typeof safe.items === 'object' ? safe.items : {};
            Object.keys(sourceItems).forEach((appId) => {
                const item = sourceItems[appId];
                if (!item || typeof item !== 'object') return;
                const statusId = slugifyStatusId(item.status_id || item.status || '');
                if (!validStatusIds.has(statusId)) return;
                items[appId] = {
                    status_id: statusId,
                    updated_at: item.updated_at || new Date().toISOString()
                };
            });

            const removedItems = {};
            const sourceRemoved = safe.removed_items && typeof safe.removed_items === 'object' ? safe.removed_items : {};
            Object.keys(sourceRemoved).forEach((appId) => {
                const item = sourceRemoved[appId];
                if (!item || typeof item !== 'object') return;
                removedItems[appId] = {
                    name_snapshot: String(item.name_snapshot || appId),
                    status_id: validStatusIds.has(slugifyStatusId(item.status_id || '')) ? slugifyStatusId(item.status_id) : null,
                    removed_at: item.removed_at || new Date().toISOString(),
                    last_seen_at: item.last_seen_at || null
                };
            });

            return {
                version: 1,
                updated_at: safe.updated_at || new Date().toISOString(),
                statuses: normalizedStatuses.map((status, index) => ({
                    id: status.id,
                    label: status.label,
                    order: index,
                    builtin: status.builtin
                })),
                items: items,
                removed_items: removedItems
            };
        }

        /**
         * Initialize roadmap state if it is missing.
         */
        ensureInitialized() {
            const raw = this.storageAvailable ? localStorage.getItem(STORAGE_KEY) : this.memoryState;
            if (!raw) {
                this.persistState(this.defaultState(), { touchUpdatedAt: false, notify: false });
                return;
            }

            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                const normalized = this.normalizeState(parsed);
                if (JSON.stringify(parsed) === JSON.stringify(normalized)) return;
                if (this.storageAvailable) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
                } else {
                    this.memoryState = cloneJson(normalized);
                }
            } catch (error) {
                console.warn('[roadmap] invalid state found during init, resetting');
                this.persistState(this.defaultState(), { touchUpdatedAt: false, notify: false });
            }
        }

        /**
         * Return all statuses sorted by order.
         */
        listStatuses() {
            return this.getState().statuses.slice().sort((a, b) => a.order - b.order);
        }

        /**
         * Return status id for an app or null.
         */
        getStatus(appId) {
            const state = this.getState();
            return state.items[appId] ? state.items[appId].status_id : null;
        }

        /**
         * Set status assignment for an app.
         */
        setStatus(appId, statusId) {
            const state = this.getState();
            const normalizedId = slugifyStatusId(statusId);
            if (!state.statuses.some((status) => status.id === normalizedId)) return state;
            state.items[appId] = { status_id: normalizedId, updated_at: new Date().toISOString() };
            delete state.removed_items[appId];
            return this.saveState(state);
        }

        /**
         * Remove status assignment for an app.
         */
        clearStatus(appId) {
            const state = this.getState();
            delete state.items[appId];
            return this.saveState(state);
        }

        /**
         * Return item and status counts.
         */
        getCounts() {
            const state = this.getState();
            const counts = {};
            state.statuses.forEach((status) => { counts[status.id] = 0; });
            Object.keys(state.items).forEach((appId) => {
                const item = state.items[appId];
                if (counts[item.status_id] !== undefined) counts[item.status_id] += 1;
            });
            return {
                by_status: counts,
                total: Object.keys(state.items).length,
                removed: Object.keys(state.removed_items).length
            };
        }

        /**
         * Return shallow copy of items map.
         */
        getAll() {
            return cloneJson(this.getState().items);
        }

        /**
         * Return removed app map.
         */
        getRemovedItems() {
            return cloneJson(this.getState().removed_items);
        }

        /**
         * Add a custom status.
         */
        addStatus(label) {
            const cleanLabel = String(label || '').trim();
            if (!cleanLabel) return this.getState();

            const state = this.getState();
            if (state.statuses.length >= MAX_STATUSES) return state;
            const labelLower = cleanLabel.toLowerCase();
            if (state.statuses.some(s => s.label.toLowerCase() === labelLower)) return state;
            const baseId = slugifyStatusId(cleanLabel);
            let candidate = baseId;
            let suffix = 2;
            while (state.statuses.some((status) => status.id === candidate)) {
                candidate = baseId + '_' + suffix;
                suffix += 1;
            }
            state.statuses.push({
                id: candidate,
                label: cleanLabel,
                order: state.statuses.length,
                builtin: false
            });
            return this.saveState(state);
        }

        /**
         * Rename an existing status label.
         */
        renameStatus(statusId, label) {
            const cleanLabel = String(label || '').trim();
            if (!cleanLabel) return this.getState();

            const state = this.getState();
            const target = state.statuses.find((status) => status.id === statusId);
            if (!target) return state;
            const labelLower = cleanLabel.toLowerCase();
            if (state.statuses.some(s => s.id !== statusId && s.label.toLowerCase() === labelLower)) return state;
            target.label = cleanLabel;
            return this.saveState(state);
        }

        /**
         * Remove a status and optionally move affected items.
         */
        removeStatus(statusId, targetStatusIdOrNull) {
            const state = this.getState();
            const idx = state.statuses.findIndex((status) => status.id === statusId);
            if (idx === -1) return state;

            const targetStatusId = targetStatusIdOrNull ? slugifyStatusId(targetStatusIdOrNull) : null;
            const hasTarget = targetStatusId && state.statuses.some((status) => status.id === targetStatusId && status.id !== statusId);
            if (!hasTarget && Object.values(state.items).some((item) => item.status_id === statusId)) {
                // If status has assignments, caller must provide valid target or clear assignments first.
                return state;
            }

            Object.keys(state.items).forEach((appId) => {
                if (state.items[appId].status_id !== statusId) return;
                if (hasTarget) {
                    state.items[appId].status_id = targetStatusId;
                    state.items[appId].updated_at = new Date().toISOString();
                } else {
                    delete state.items[appId];
                }
            });

            state.statuses.splice(idx, 1);
            state.statuses = state.statuses.map((status, order) => ({ id: status.id, label: status.label, builtin: status.builtin, order: order }));
            return this.saveState(state);
        }

        /**
         * Reorder status ids.
         */
        reorderStatuses(order) {
            const state = this.getState();
            const ids = Array.isArray(order) ? order.map(slugifyStatusId) : [];
            if (!ids.length) return state;

            const ordered = [];
            ids.forEach((id) => {
                const status = state.statuses.find((item) => item.id === id);
                if (status && !ordered.some((item) => item.id === status.id)) ordered.push(status);
            });
            state.statuses.forEach((status) => {
                if (!ordered.some((item) => item.id === status.id)) ordered.push(status);
            });
            state.statuses = ordered.map((status, idx) => ({
                id: status.id,
                label: status.label,
                order: idx,
                builtin: status.builtin
            }));
            return this.saveState(state);
        }

        /**
         * Remove one catalog-removal alert entry without touching assignments.
         */
        clearRemovedItem(appId) {
            const state = this.getState();
            if (!appId || !state.removed_items[appId]) return state;
            delete state.removed_items[appId];
            return this.saveState(state);
        }

        /**
         * Sync roadmap items with the current catalog: drop missing apps or record them as removed.
         * @param {Array<{id: string}>} apps App list from search.json
         * @param {{ trackRemoved?: boolean }} options If trackRemoved is false, missing apps are deleted silently and removed_items is cleared.
         */
        reconcileAgainstCatalog(apps, options) {
            const state = this.getState();
            const catalogById = {};
            (apps || []).forEach((app) => {
                if (app && app.id) catalogById[app.id] = app;
            });
            const trackRemoved = !options || options.trackRemoved !== false;

            if (!trackRemoved) {
                Object.keys(state.items).forEach((appId) => {
                    if (!catalogById[appId]) delete state.items[appId];
                });
                state.removed_items = {};
                return this.saveState(state);
            }

            Object.keys(state.items).forEach((appId) => {
                if (catalogById[appId]) return;
                const item = state.items[appId];
                state.removed_items[appId] = {
                    name_snapshot: state.removed_items[appId] && state.removed_items[appId].name_snapshot ? state.removed_items[appId].name_snapshot : appId,
                    status_id: item.status_id,
                    removed_at: new Date().toISOString(),
                    last_seen_at: item.updated_at || null
                };
                delete state.items[appId];
            });

            Object.keys(state.removed_items).forEach((appId) => {
                if (!catalogById[appId]) return;
                const removed = state.removed_items[appId];
                if (removed.status_id && state.statuses.some((status) => status.id === removed.status_id)) {
                    state.items[appId] = {
                        status_id: removed.status_id,
                        updated_at: new Date().toISOString()
                    };
                }
                delete state.removed_items[appId];
            });

            return this.saveState(state);
        }
    }

    window.RoadmapStore = new RoadmapStore();
    window.RoadmapStoreConstants = {
        EVENT_NAME: EVENT_NAME,
        STORAGE_KEY: STORAGE_KEY,
        MAX_STATUSES: MAX_STATUSES
    };
})();
