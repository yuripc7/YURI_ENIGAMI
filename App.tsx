import React, { useState, useMemo, useRef, useEffect } from 'react';
import { INITIAL_DB } from './constants';
import { DB, ChatMessage, Project, Event, Company } from './types';
import { generateChatResponse } from './services/geminiService';
import {
    LodModal, CompanyModal, ProjectModal, ScopeModal, EventModal,
    ChecklistModal, TeamModal, TimelineSettingsModal, AdminSettingsModal, DisciplinesManagerModal
} from './components/Modals';
import Timeline from './components/Timeline';

const STORAGE_KEY = 'design_board_db_v1';
const THEME_KEY = 'design_board_theme_v1';

export const App = () => {
    const [db, setDb] = useState<DB>(() => {
        const savedDb = localStorage.getItem(STORAGE_KEY);
        return savedDb ? JSON.parse(savedDb) : INITIAL_DB;
    });

    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem(THEME_KEY);
        return savedTheme || 'dark';
    });

    const [deadlineRespFilter, setDeadlineRespFilter] = useState('');
    const [logSearch, setLogSearch] = useState('');
    const [logAuthorFilter, setLogAuthorFilter] = useState('');
    
    // CHANGED: zoomLevel is now a number for smooth scrolling
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    
    const [activityImage, setActivityImage] = useState<string | undefined>(undefined);
    const activityFileRef = useRef<HTMLInputElement>(null);
    const [activeHealthTab, setActiveHealthTab] = useState<'total' | 'progress' | 'done' | 'efficiency'>('efficiency');
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // New: Team Filter State
    const [memberFilter, setMemberFilter] = useState<string | null>(null);

    // Modals state
    const [showLodModal, setShowLodModal] = useState(false);
    const [showCompanyModal, setShowCompanyModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showScopeModal, setShowScopeModal] = useState(false);
    const [showDisciplinesModal, setShowDisciplinesModal] = useState(false);
    const [showEventModal, setShowEventModal] = useState(false);
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showAdminModal, setShowAdminModal] = useState(false);

    // Chat
    const [showAIChat, setShowAIChat] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [userInput, setUserInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Selection IDs
    const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
    const [editingEventId, setEditingEventId] = useState<string | null>(null);
    const [selectedScopeIdForFiles, setSelectedScopeIdForFiles] = useState<string | null>(null);
    const [activeScopeIdForEvent, setActiveScopeIdForEvent] = useState<string | null>(null);
    const [activeChecklistIds, setActiveChecklistIds] = useState<{ sid: string; eid: string } | null>(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }, [db]);

    useEffect(() => {
        document.documentElement.className = theme;
        localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const activeProject = useMemo(() => {
        return db.projects.find(p => p.id === db.activeProjectId) || null;
    }, [db.projects, db.activeProjectId]);

    const activeCompany = useMemo(() => {
        return db.companies.find(c => c.id === db.activeCompanyId) || null;
    }, [db.companies, db.activeCompanyId]);

    const selectedScope = useMemo(() => {
        return activeProject?.scopes.find(s => s.id === (selectedScopeIdForFiles || editingScopeId)) || null;
    }, [activeProject, selectedScopeIdForFiles, editingScopeId]);

    const editingEvent = useMemo(() => {
        if (!activeProject || !activeScopeIdForEvent || !editingEventId) return null;
        const scope = activeProject.scopes.find(s => s.id === activeScopeIdForEvent);
        return scope?.events.find(e => e.id === editingEventId) || null;
    }, [activeProject, activeScopeIdForEvent, editingEventId]);

    // Calculate Team Stats (Action Counts & Leadership)
    const teamStats = useMemo(() => {
        const stats: Record<string, { count: number; leaderOf: string[] }> = {};
        db.team.forEach(t => { stats[t] = { count: 0, leaderOf: [] }; });

        if (activeProject) {
            activeProject.scopes.forEach(s => {
                if (stats[s.resp]) {
                    if (!stats[s.resp]) stats[s.resp] = { count: 0, leaderOf: [] };
                    stats[s.resp].leaderOf.push(s.name);
                }
                s.events.forEach(e => {
                    if (stats[e.resp]) {
                         stats[e.resp].count++;
                    } else if (stats[e.resp] === undefined) {
                         // Handle case where resp might not be in db.team list explicitly
                         stats[e.resp] = { count: 1, leaderOf: [] };
                    }
                });
            });
        }
        return stats;
    }, [activeProject, db.team]);

    // Dynamic Bounds based on Content (Scope Start -> Last Event End)
    const projectBounds = useMemo(() => {
        if (!activeProject || activeProject.scopes.length === 0) {
            return activeProject 
                ? { start: activeProject.timelineStart, end: activeProject.timelineEnd }
                : { start: '2026-01-01', end: '2026-12-31' };
        }

        let minStart = new Date(3000, 0, 1).getTime();
        let maxEnd = new Date(2000, 0, 1).getTime();
        let hasData = false;

        activeProject.scopes.forEach(s => {
            const scopeStart = new Date(s.startDate).getTime();
            if (scopeStart < minStart) minStart = scopeStart;
            hasData = true;

            s.events.forEach(e => {
                const eventEnd = new Date(e.endDate).getTime();
                if (eventEnd > maxEnd) maxEnd = eventEnd;
            });
        });
        
        if (maxEnd < minStart) {
             maxEnd = new Date(minStart).getTime() + (30 * 24 * 60 * 60 * 1000);
        }

        return {
            start: hasData ? new Date(minStart).toISOString().split('T')[0] : activeProject.timelineStart,
            end: hasData ? new Date(maxEnd).toISOString().split('T')[0] : activeProject.timelineEnd
        };
    }, [activeProject]);

    // Calculate Global Progress Percentage
    const globalProgress = useMemo(() => {
        if (!activeProject) return 0;
        
        const start = new Date(activeProject.timelineStart).getTime();
        const end = new Date(activeProject.timelineEnd).getTime();
        const now = new Date().getTime();
        
        if (now < start) return 0;
        if (now > end) return 100;
        
        const total = end - start;
        const elapsed = now - start;
        
        if (total <= 0) return 0;
        return Math.min(Math.max((elapsed / total) * 100, 0), 100);
    }, [activeProject]);

    // Calculate Hours Spent (8h per business day from start to now/end)
    const hoursSpent = useMemo(() => {
        if (!activeProject) return 0;
        
        const start = new Date(projectBounds.start);
        const endCap = new Date(projectBounds.end);
        const now = new Date();
        
        // Use the lesser of 'today' or 'project end' as the calculation boundary
        const calcEnd = now < endCap ? now : endCap;
        
        if (calcEnd < start) return 0;

        let businessDays = 0;
        const cur = new Date(start);
        while (cur <= calcEnd) {
            const dayOfWeek = cur.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sun (0) or Sat (6)
                businessDays++;
            }
            cur.setDate(cur.getDate() + 1);
        }

        return businessDays * 8;
    }, [activeProject, projectBounds]);

    // Wave Path Generator based on Checklist Quantity Density
    const wavePath = useMemo(() => {
        if (!activeProject) return "M0,100 L100,100";

        const start = new Date(projectBounds.start).getTime();
        const end = new Date(projectBounds.end).getTime();
        const duration = end - start;
        if (duration <= 0) return "M0,100 L100,100";

        const segments = 10;
        const interval = duration / segments;
        const buckets = new Array(segments + 1).fill(0);

        // Count checklist items per time segment
        activeProject.scopes.forEach(s => {
            s.events.forEach(e => {
                const eEnd = new Date(e.endDate).getTime();
                if (eEnd >= start && eEnd <= end) {
                    const bucketIndex = Math.min(Math.floor((eEnd - start) / interval), segments);
                    buckets[bucketIndex] += (e.checklist && e.checklist.length > 0) ? e.checklist.length : 1;
                }
            });
        });

        // Smooth curve generation
        const maxVal = Math.max(...buckets, 1);
        const points = buckets.map((count, i) => {
            const x = (i / segments) * 100;
            const y = 100 - ((count / maxVal) * 60); // Max height 60% of container to keep it wavy at bottom
            return { x, y };
        });

        // Start path
        let d = `M0,100 L0,${points[0].y}`;
        
        // Quadratic bezier for smoothness
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            // Control point logic for wave
            d += ` Q${p0.x + (midX - p0.x)/2},${p0.y} ${midX},${midY} T${p1.x},${p1.y}`;
        }

        d += ` L100,100 Z`; // Close path
        return d;
    }, [activeProject, projectBounds]);

    const getNowString = () => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const addLog = (author: string, text: string, imageUrl?: string) => {
        if (!db.activeProjectId) return;
        setDb(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === db.activeProjectId ? {
                ...p,
                updatedAt: new Date().toISOString(),
                activities: [...p.activities, { date: getNowString(), author: author.toUpperCase(), text: text.toUpperCase(), imageUrl }]
            } : p)
        }));
    };

    const onDeleteScope = (sid: string) => {
        if (!activeProject) return;
        setDb(prev => ({ ...prev, projects: prev.projects.map(p => p.id === activeProject.id ? { ...p, updatedAt: new Date().toISOString(), scopes: p.scopes.filter(s => s.id !== sid) } : p) }));
        if (selectedScopeIdForFiles === sid) setSelectedScopeIdForFiles(null);
        addLog("SISTEMA", `DISCIPLINA REMOVIDA`);
    };
    
    // Function to Add File (Missing previously)
    const onAddFile = (label: string, path: string) => {
        if (!activeProject || !selectedScopeIdForFiles) return;
        setDb(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === activeProject.id ? {
                ...p,
                updatedAt: new Date().toISOString(),
                scopes: p.scopes.map(s => s.id === selectedScopeIdForFiles ? {
                    ...s,
                    fileLinks: [...(s.fileLinks || []), { label, path }]
                } : s)
            } : p)
        }));
        addLog("SISTEMA", `ARQUIVO VINCULADO: ${label}`);
    };

    const onDeleteEvent = (sid: string, eid: string) => {
        if (!activeProject) return;
        setDb(prev => ({ ...prev, projects: prev.projects.map(p => p.id === activeProject.id ? { ...p, updatedAt: new Date().toISOString(), scopes: p.scopes.map(s => s.id === sid ? { ...s, events: s.events.filter(e => e.id !== eid) } : s) } : p) }));
        addLog("SISTEMA", `AÇÃO REMOVIDA`);
    };
    const onToggleDependency = (sid: string, eid: string, targetId: string) => {
        setDb(prev => ({ ...prev, projects: prev.projects.map(p => p.id === activeProject?.id ? { ...p, scopes: p.scopes.map(s => s.id === sid ? { ...s, events: s.events.map(ev => ev.id === eid ? { ...ev, dependencies: ev.dependencies?.find(d => d.id === targetId) ? ev.dependencies.filter(d => d.id !== targetId) : [...(ev.dependencies||[]), { id: targetId, type: 'FS' as const }] } : ev) } : s) } : p) }));
    };
    const onChangeDependencyType = (sid: string, eid: string, targetId: string) => {
        const types = ['FS', 'SS', 'FF', 'SF'] as const;
        setDb(prev => ({ ...prev, projects: prev.projects.map(p => p.id === activeProject?.id ? { ...p, scopes: p.scopes.map(s => s.id === sid ? { ...s, events: s.events.map(ev => ev.id === eid ? { ...ev, dependencies: (ev.dependencies||[]).map(d => d.id === targetId ? { ...d, type: types[(types.indexOf(d.type)+1)%types.length] } : d) } : ev) } : s) } : p) }));
    };
    
    // NEW: Function to Add Dependency via Drag & Drop
    const onAddDependency = (sourceId: string, targetId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => {
        if (!activeProject) return;
        
        // Find scope for source event
        const sourceScope = activeProject.scopes.find(s => s.events.some(e => e.id === sourceId));
        if (!sourceScope) return;

        // Find scope for target event
        const targetScope = activeProject.scopes.find(s => s.events.some(e => e.id === targetId));
        // We only update the TARGET event to depend on SOURCE event
        if (!targetScope) return;

        // Check if dependency already exists to avoid duplicates
        const targetEvent = targetScope.events.find(e => e.id === targetId);
        if (targetEvent?.dependencies?.some(d => d.id === sourceId)) {
            // Already linked - maybe notify or ignore
            setNotification("Vínculo já existe!");
            setTimeout(() => setNotification(null), 2000);
            return;
        }

        setDb(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === activeProject.id ? {
                ...p,
                updatedAt: new Date().toISOString(),
                scopes: p.scopes.map(s => s.id === targetScope.id ? {
                    ...s,
                    events: s.events.map(e => e.id === targetId ? {
                        ...e,
                        dependencies: [...(e.dependencies || []), { id: sourceId, type }]
                    } : e)
                } : s)
            } : p)
        }));
        
        addLog("SISTEMA", `VÍNCULO CRIADO: ${type}`);
    };

    // NEW: Project Deletion & Editing
    const onDeleteProject = (id: number) => {
        setDb(prev => ({
            ...prev,
            projects: prev.projects.filter(p => p.id !== id),
            activeProjectId: prev.activeProjectId === id ? null : prev.activeProjectId
        }));
    };

    const onEditProject = (id: number, name: string, logo?: string, cover?: string) => {
        setDb(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === id ? { ...p, name, logoUrl: logo, coverUrl: cover, updatedAt: new Date().toISOString() } : p)
        }));
    };

    const exportHTML = () => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const originalInputs = document.querySelectorAll('input');
        const clonedInputs = clone.querySelectorAll('input');
        originalInputs.forEach((input, i) => {
            if (clonedInputs[i]) {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    if (input.checked) clonedInputs[i].setAttribute('checked', 'checked');
                    else clonedInputs[i].removeAttribute('checked');
                } else {
                    clonedInputs[i].setAttribute('value', input.value);
                }
            }
        });

        const originalTextareas = document.querySelectorAll('textarea');
        const clonedTextareas = clone.querySelectorAll('textarea');
        originalTextareas.forEach((txt, i) => {
            if (clonedTextareas[i]) {
                clonedTextareas[i].textContent = txt.value;
                clonedTextareas[i].innerHTML = txt.value;
            }
        });

        const originalSelects = document.querySelectorAll('select');
        const clonedSelects = clone.querySelectorAll('select');
        originalSelects.forEach((sel, i) => {
            if (clonedSelects[i]) {
                const val = sel.value;
                const options = clonedSelects[i].querySelectorAll('option');
                options.forEach(opt => {
                    if (opt.value === val) opt.setAttribute('selected', 'selected');
                    else opt.removeAttribute('selected');
                });
            }
        });

        const scripts = clone.querySelectorAll('script');
        scripts.forEach(script => {
            const src = script.getAttribute('src') || '';
            const content = script.innerHTML || '';
            if (!src.includes('tailwindcss') && !content.includes('tailwind.config')) {
                script.remove();
            }
        });

        const floatingButtons = clone.querySelector('.fixed.bottom-8.right-8');
        if (floatingButtons) floatingButtons.remove();

        const aiChat = clone.querySelector('.fixed.bottom-28.right-8');
        if (aiChat) aiChat.remove();

        const openModals = clone.querySelectorAll('[data-modal-overlay="true"]');
        openModals.forEach(el => el.remove());
        
        const notifications = clone.querySelectorAll('.fixed.top-8');
        notifications.forEach(el => el.remove());

        const htmlContent = `<!DOCTYPE html>\n${clone.outerHTML}`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dashboard-${activeProject?.name || 'export'}-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        addLog("SISTEMA", "DASHBOARD EXPORTADO PARA HTML");
    };

    const exportPython = () => {
        if (!activeProject) return;

        // Convert data to JSON string then replace JS bools/null with Python equivalents
        const jsonStr = JSON.stringify(activeProject, null, 4)
            .replace(/: true/g, ': True')
            .replace(/: false/g, ': False')
            .replace(/: null/g, ': None');

        const pyContent = `# Exportado do Design Board Dashboard
# Projeto: ${activeProject.name}
# Data: ${new Date().toLocaleString()}

import datetime

# Dicionário com dados do projeto
project_data = ${jsonStr}

def print_project_summary(data):
    print(f"--- Resumo do Projeto: {data['name']} ---")
    print(f"Empresa ID: {data['companyId']}")
    print(f"Disciplinas: {len(data['scopes'])}")
    total_actions = sum(len(scope['events']) for scope in data['scopes'])
    print(f"Total de Ações: {total_actions}")
    print("-" * 30)

if __name__ == "__main__":
    print_project_summary(project_data)
    # Você pode acessar os dados via 'project_data'
`;

        const blob = new Blob([pyContent], { type: 'text/x-python' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dados_${activeProject.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.py`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addLog("SISTEMA", "DADOS EXPORTADOS EM PYTHON");
    };

    const printDashboard = () => { window.print(); addLog("SISTEMA", "DASHBOARD ENVIADO PARA IMPRESSÃO"); };

    const filteredActivities = useMemo(() => {
        if (!activeProject) return [];
        return activeProject.activities.filter(a => {
            const matchText = a.text.toLowerCase().includes(logSearch.toLowerCase());
            const matchAuthor = logAuthorFilter === '' || a.author === logAuthorFilter.toUpperCase();
            return matchText && matchAuthor;
        });
    }, [activeProject, logSearch, logAuthorFilter]);

    const stats = useMemo(() => {
        if (!activeProject) return { tot: 0, don: 0, lat: 0, rate: 0, inProgress: 0, taskCount: 0 };
        let totItems = 0; let donItems = 0; let latEvents = 0; let inProg = 0; let tasks = 0;
        const today = new Date();
        activeProject.scopes.forEach(sc => {
            sc.events.forEach(ev => {
                tasks++;
                const items = ev.checklist && ev.checklist.length > 0 ? ev.checklist.length : 1;
                const done = ev.checklist && ev.checklist.length > 0 ? ev.checklist.filter(i => i.done).length : (ev.completed ? 1 : 0);
                
                totItems += items;
                donItems += done;
                
                if (!ev.completed && new Date(ev.startDate) <= today) {
                    inProg++;
                }

                if (!ev.completed && new Date(ev.endDate) < today) latEvents++;
            });
        });
        return { 
            tot: totItems, 
            don: donItems, 
            lat: latEvents, 
            rate: totItems ? Math.round((donItems / totItems) * 100) : 0,
            inProgress: inProg,
            taskCount: tasks
        };
    }, [activeProject]);

    const progressPercentage = useMemo(() => {
        if (!activeProject) return 0;
        // CHANGED: Start date is now Project Creation Date
        const start = new Date(activeProject.createdAt);
        // End date is based on project bounds (latest event or timeline end)
        const end = new Date(projectBounds.end);
        
        const today = new Date();
        if (today < start) return 0;
        if (today > end) return 100;
        
        const totalDuration = end.getTime() - start.getTime();
        const elapsed = today.getTime() - start.getTime();
        
        if (totalDuration <= 0) return 0;
        return Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
    }, [activeProject, projectBounds]);

    // MODIFIED: Strict delay logic
    const projectHealth = useMemo(() => {
        if (!activeProject) return { label: '---', color: 'text-theme-textMuted', border: 'border-theme-card', bg: 'bg-theme-card' };

        const today = new Date();
        const isAnyEventLate = activeProject.scopes.some(scope => 
            scope.events.some(ev => {
                const endDate = new Date(ev.endDate);
                return !ev.completed && today > endDate;
            })
        );

        if (isAnyEventLate) {
            return { label: 'ATRASADO', color: 'text-theme-red', border: 'border-theme-red', bg: 'bg-theme-red/10' };
        }

        const diff = stats.rate - progressPercentage;
        if (diff < 0) return { label: 'NO LIMITE', color: 'text-yellow-500', border: 'border-yellow-500', bg: 'bg-yellow-500/10' };
        return { label: 'DENTRO DO PRAZO', color: 'text-theme-green', border: 'border-theme-green', bg: 'bg-theme-green/10' };
    }, [activeProject, stats.rate, progressPercentage]);

    // AI Chat Handler
    const handleAISend = async () => {
        if (!userInput.trim() || !activeProject) return;
        const query = userInput; setUserInput(''); setChatMessages(prev => [...prev, { role: 'user', text: query }]); setAiLoading(true);
        
        // Enhanced Context
        const delayedEvents = activeProject.scopes.flatMap(s => s.events.filter(ev => ev.plannedEndDate && new Date(ev.endDate) > new Date(ev.plannedEndDate)).map(ev => `${ev.title} (Resp: ${ev.resp}) - Atraso`));
        const contextData = { 
            project: activeProject.name, 
            health: projectHealth.label, 
            completionRate: `${stats.rate}%`,
            delayedItems: delayedEvents,
            teamLoad: teamStats,
            totalTasks: stats.taskCount,
            tasksInProgress: stats.inProgress
        };
        
        const responseText = await generateChatResponse(query, `Você é o DesignBot, um Gerente de Projetos Sênior especializado em arquitetura e construção. Analise os dados técnicos abaixo e responda de forma estratégica, proativa e direta. Se houver atrasos, sugira soluções. Se houver sobrecarga na equipe, aponte. Contexto Atual do Projeto: ${JSON.stringify(contextData)}`);
        setChatMessages(prev => [...prev, { role: 'ai', text: responseText }]); setAiLoading(false);
    };

    const hasLod = !!db.activeLod; const hasCompany = !!db.activeCompanyId; const hasProject = !!db.activeProjectId;

    return (
        <div className={`min-h-screen p-4 md:p-8 flex flex-col items-center font-sans relative pb-32 overflow-x-hidden bg-theme-bg text-theme-text`}>
            {/* PRINT ONLY HEADER */}
            <div className="hidden print:flex flex-col w-full mb-8 border-b-2 border-black pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-square font-black text-black uppercase tracking-widest leading-none">
                            {activeProject?.name || 'Projeto'}
                        </h1>
                        <h2 className="text-xl font-bold text-gray-600 uppercase tracking-wide mt-2 flex items-center gap-2">
                             {activeCompany?.name || 'Empresa'} <span className="text-gray-400">|</span> {db.activeLod}
                        </h2>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-mono text-gray-500 uppercase">Relatório Gerado em</p>
                        <p className="text-lg font-bold text-black">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>

            {/* NOTIFICATION TOAST */}
            {notification && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-theme-green text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest shadow-xl animate-scaleIn flex items-center gap-3">
                    <span className="material-symbols-outlined">check_circle</span>
                    {notification}
                </div>
            )}

            {/* Image Viewer Overlay */}
            {viewingImage && (
                <div data-modal-overlay="true" className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-10 animate-fadeIn" onClick={() => setViewingImage(null)}>
                    <button className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors z-[210]">
                        <span className="material-symbols-outlined text-4xl">close</span>
                    </button>
                    <img src={viewingImage} className="max-w-full max-h-full rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10" onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {/* ... (AI Chat & Header Code Remains) ... */}
            <div className="fixed bottom-8 right-8 z-[110] flex flex-col gap-4 no-print">
                <button onClick={() => setShowAIChat(!showAIChat)} className="ds-card w-14 h-14 rounded-full hover:scale-110 active:scale-95 transition-all flex items-center justify-center group relative border border-theme-cyan/30">
                    <span className="material-symbols-outlined text-3xl text-theme-cyan group-hover:animate-pulse">smart_toy</span>
                    {!showAIChat && <div className="absolute -top-1 -right-1 bg-theme-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-theme-bg animate-bounce">AI</div>}
                </button>
                <button onClick={() => setShowAdminModal(true)} className="ds-card w-14 h-14 rounded-full hover:scale-110 active:scale-95 transition-all flex items-center justify-center group border border-theme-orange/30">
                    <span className="material-symbols-outlined text-3xl text-theme-orange group-hover:rotate-90 transition-transform duration-500">settings</span>
                </button>
            </div>
            
             {showAIChat && (
                <div className="fixed bottom-28 right-8 z-[120] w-[380px] h-[550px] ds-card rounded-[24px] flex flex-col overflow-hidden animate-scaleIn no-print shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                    <div className="bg-theme-cyan/10 p-5 flex justify-between items-center border-b border-theme-cyan/20">
                        <div className="flex items-center gap-3"><span className="material-symbols-outlined text-theme-cyan bg-theme-cyan/10 rounded-lg p-1.5 text-xl border border-theme-cyan/30">smart_toy</span><div><h4 className="text-white font-square font-bold text-sm tracking-wide leading-none">DesignBot</h4><span className="text-theme-cyan/60 text-[10px] font-medium uppercase tracking-wider">Online</span></div></div><button onClick={() => setShowAIChat(false)} className="text-theme-textMuted hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
                    </div>
                    <div className="flex-1 overflow-y-auto scroller p-5 space-y-4">
                        {chatMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3 opacity-50"><span className="material-symbols-outlined text-5xl text-theme-textMuted">chat_bubble</span><p className="text-[11px] font-medium text-theme-textMuted uppercase tracking-widest">Estou analisando o projeto...</p></div>}
                        {chatMessages.map((msg, i) => <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm border ${msg.role === 'user' ? 'bg-theme-cyan/20 border-theme-cyan/30 text-white rounded-tr-sm' : 'bg-theme-card border-theme-divider text-theme-textMuted rounded-tl-sm'}`}>{msg.text}</div></div>)}
                        {aiLoading && <div className="flex justify-start animate-pulse"><div className="bg-theme-card border border-theme-divider text-theme-textMuted px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Pensando...</div></div>}
                        <div ref={chatEndRef} />
                    </div>
                    <div className="p-4 border-t border-theme-divider bg-theme-bg"><form onSubmit={(e) => { e.preventDefault(); handleAISend(); }} className="flex gap-2"><input type="text" placeholder="Perguntar sobre o projeto..." className="flex-1 bg-theme-card border border-theme-divider rounded-xl px-4 py-3 text-xs text-theme-text outline-none focus:border-theme-cyan/50 transition-all placeholder:text-theme-textMuted" value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={aiLoading} /><button type="submit" className="bg-theme-cyan/20 text-theme-cyan border border-theme-cyan/30 rounded-xl px-4 flex items-center justify-center hover:bg-theme-cyan/30 transition-all disabled:opacity-50" disabled={aiLoading || !userInput.trim()}><span className="material-symbols-outlined text-lg">send</span></button></form></div>
                </div>
            )}

            <div className="flex flex-col gap-8 w-full max-w-[1600px]">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
                     <div className="lg:col-span-4 flex flex-col gap-6">
                        <div className="grid grid-cols-2 gap-4">
                            {/* 1. Cliente (Agora o primeiro) */}
                            <div className={`ds-card-accent p-4 flex flex-col items-center justify-center text-center h-48 transition-all relative cursor-pointer hover:-translate-y-1`} onClick={() => setShowCompanyModal(true)}>
                                <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-2 flex items-center gap-1 border border-white/20 px-2 py-0.5 rounded-full bg-white/10">1. Cliente <span className="material-symbols-outlined text-xs">chevron_right</span></span>
                                {activeCompany?.logoUrl ? (
                                    <img src={activeCompany.logoUrl} className="w-16 h-16 object-contain my-2 bg-white/10 rounded-lg backdrop-blur-md" />
                                ) : (
                                    <h2 className="font-square font-black text-white uppercase text-lg truncate w-full px-2 mt-1">{activeCompany?.name || 'Selecione'}</h2>
                                )}
                                {hasCompany && <span className="material-symbols-outlined absolute right-3 bottom-3 text-white/30 text-2xl">check_circle</span>}
                            </div>

                            {/* Datas */}
                            <div className={`grid grid-rows-2 gap-3 h-48 transition-all ${!hasProject ? 'opacity-30 blur-[1px]' : ''}`}>
                                <div className={`ds-card p-2 flex flex-col justify-center items-center group hover:border-theme-orange/30 transition-colors`}><span className="text-theme-orange font-bold text-[9px] mb-1 uppercase tracking-widest text-center opacity-80">Última Atualização</span><span className="text-xs font-mono font-medium text-theme-text/90 bg-theme-highlight px-2 py-1 rounded-md border border-theme-divider">{activeProject ? new Date(activeProject.updatedAt).toLocaleDateString() : '--/--/--'}</span></div>
                                <div className={`ds-card p-2 flex flex-col justify-center items-center group hover:border-theme-orange/30 transition-colors`}><span className="text-theme-orange font-bold text-[9px] mb-1 uppercase tracking-widest opacity-80">Início do Projeto</span><span className="text-xs font-mono font-medium text-theme-text/90 bg-theme-highlight px-2 py-1 rounded-md border border-theme-divider">{activeProject ? new Date(activeProject.createdAt).toLocaleDateString() : '--/--/--'}</span></div>
                            </div>
                            
                            {/* 2. Fase (Agora o segundo) */}
                            <div className={`ds-card-accent cursor-pointer p-4 flex flex-col justify-center items-center text-center h-48 transition-all relative group overflow-hidden ${!hasCompany ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:-translate-y-1'}`} onClick={() => hasCompany && setShowLodModal(true)}>
                                <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1 flex items-center gap-1 border border-white/20 px-2 py-0.5 rounded-full bg-white/10">2. Fase <span className="material-symbols-outlined text-xs">chevron_right</span></span>
                                <h1 className="text-xl md:text-2xl font-square font-black text-white leading-tight uppercase drop-shadow-sm mt-2">{db.activeLod ? <>{db.activeLod}_<br /><span className="text-lg opacity-90 font-medium font-sans">{db.lods.find(l => l.startsWith(db.activeLod))?.split('_ ')[1] || '---'}</span></> : 'Selecionar'}</h1>
                                {hasLod && <span className="material-symbols-outlined absolute right-3 bottom-3 text-white/30 text-2xl">check_circle</span>}
                            </div>
                            
                            {/* 3. Projeto */}
                            <div className={`ds-card-accent p-4 flex flex-col items-center justify-center h-48 transition-all relative group overflow-hidden ${!hasCompany || !hasLod ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1'}`} onClick={() => hasCompany && hasLod && setShowProjectModal(true)}>
                                {activeProject?.coverUrl && (
                                    <div 
                                        className="absolute inset-0 bg-cover bg-center opacity-50 transition-all duration-500 z-0 mix-blend-overlay"
                                        style={{ backgroundImage: `url(${activeProject.coverUrl})` }}
                                    />
                                )}
                                
                                <div className="relative z-10 flex flex-col items-center w-full">
                                    <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1 flex items-center gap-1 border border-white/20 px-2 py-0.5 rounded-full bg-white/10">3. Projeto <span className="material-symbols-outlined text-xs">chevron_right</span></span>
                                    {activeProject?.logoUrl ? <img src={activeProject.logoUrl} className="w-14 h-14 object-contain mb-2 mt-2 bg-white/10 rounded-lg" /> : <span className="material-symbols-outlined text-4xl text-white/90 mb-1 mt-2">rocket_launch</span>}
                                    <h2 className="text-base font-square font-black text-white uppercase truncate w-full px-2 text-center drop-shadow-md">{activeProject?.name || 'Selecione'}</h2>
                                </div>
                                {hasProject && <span className="material-symbols-outlined absolute right-3 bottom-3 text-white/30 text-2xl z-10">check_circle</span>}
                            </div>
                        </div>
                        <div className={`ds-card p-6 h-[278px] flex flex-col transition-all duration-500 ${!hasProject ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                            <div className="flex justify-between items-center mb-4"><h3 className="font-square font-bold text-theme-orange text-xs uppercase tracking-widest flex items-center gap-2"><span className="material-symbols-outlined text-lg">folder_open</span> Arquivos {selectedScope && <span className="text-theme-textMuted">| {selectedScope.name}</span>}</h3>{selectedScope && (<button onClick={() => setSelectedScopeIdForFiles(null)} className="text-theme-textMuted hover:text-white flex items-center gap-1 text-[9px] font-bold uppercase transition-colors">Fechar <span className="material-symbols-outlined text-sm">close</span></button>)}</div>
                            {!selectedScope ? (<div className="flex-1 flex flex-col items-center justify-center border border-dashed border-theme-divider rounded-2xl bg-theme-highlight"><p className="text-[10px] text-theme-textMuted font-bold uppercase tracking-widest text-center px-10">Selecione uma disciplina na lista ao lado</p></div>) : (<div className="flex-1 flex flex-col overflow-hidden"><div className="flex-grow overflow-y-auto scroller pr-1 mb-4 space-y-2">{selectedScope.fileLinks?.map((link, idx) => (<a key={idx} href={link.path} target="_blank" rel="noreferrer" className={`group flex items-center justify-between p-3 rounded-xl border border-theme-divider bg-theme-highlight hover:border-theme-orange/30 transition-all cursor-pointer`}><div className="flex flex-col truncate"><span className={`text-[10px] font-bold uppercase truncate text-theme-textMuted group-hover:text-theme-text`}>{link.label}</span></div><span className="material-symbols-outlined text-xs text-theme-orange opacity-50 group-hover:opacity-100">open_in_new</span></a>))}</div><form className={`flex flex-col gap-2 pt-2 border-t border-theme-divider flex flex-col gap-3`} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const l = (f.elements.namedItem('l') as HTMLInputElement).value; const p = (f.elements.namedItem('p') as HTMLInputElement).value; if (l && p) { onAddFile(l, p); f.reset(); } }}><div className="flex gap-2"><input name="l" placeholder="Nome..." className={`w-1/3 border border-theme-divider rounded-lg px-3 py-2 text-[9px] outline-none bg-theme-bg text-theme-text focus:border-theme-orange/50 transition-colors`} required /><input name="p" placeholder="Link..." className={`flex-1 border border-theme-divider rounded-lg px-3 py-2 text-[9px] outline-none bg-theme-bg text-theme-text focus:border-theme-orange/50 transition-colors`} required /></div><button type="submit" className="bg-theme-orange/10 border border-theme-orange/20 text-theme-orange hover:text-white font-bold text-[9px] py-2 rounded-xl uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-theme-orange transition-all"><span className="material-symbols-outlined text-xs">add_link</span> Confirmar</button></form></div>)}
                        </div>
                    </div>
                    
                    <div className={`lg:col-span-4 flex flex-col gap-6 transition-all duration-700 ${!hasProject ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100'}`}>
                         <div className="ds-card-accent p-4 flex flex-col items-center justify-center h-28 relative overflow-hidden"><div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div><h2 className="text-[10px] font-square font-black text-white tracking-[0.25em] mb-4 uppercase flex items-center gap-2 relative z-10"><span className="material-symbols-outlined text-base">history</span> Atualizações Recentes</h2><div className="w-full flex gap-2 px-2 relative z-10"><input type="text" placeholder="PESQUISAR..." className="flex-1 bg-black/20 backdrop-blur-sm border border-white/20 rounded-xl py-2 px-4 text-[10px] font-bold text-white placeholder:text-white/50 outline-none focus:bg-black/30 transition-all" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} /><select className="w-24 bg-black/20 backdrop-blur-sm border border-white/20 rounded-xl px-2 text-[9px] font-bold text-white outline-none focus:bg-black/30" value={logAuthorFilter} onChange={(e) => setLogAuthorFilter(e.target.value)}><option value="" className="text-black">TODOS</option>{db.team.map(t => <option key={t} value={t} className="text-black">{t}</option>)}<option value="SISTEMA" className="text-black">SISTEMA</option></select></div></div>
                         <div className={`ds-card p-6 flex flex-col h-[524px] overflow-hidden relative`}><div className="flex-grow scroller overflow-y-auto space-y-5 pr-3 mb-4 pt-2">{filteredActivities.slice().reverse().map((a, i) => (<div key={i} className="flex flex-col gap-1 border-l border-theme-divider pl-5 pb-1 relative group"><div className="absolute -left-[3px] top-1.5 w-[5px] h-[5px] rounded-full bg-theme-orange shadow-[0_0_10px_rgba(249,115,22,0.8)] ring-2 ring-black" /><div className="flex justify-between items-baseline"><span className={`font-bold text-[10px] uppercase tracking-wide ${a.author === 'SISTEMA' ? 'text-theme-orange/80' : 'text-theme-cyan'}`}>{a.author}</span><span className="text-zinc-600 font-mono text-[9px]">{a.date}</span></div><p className={`text-[11px] font-medium leading-relaxed text-theme-textMuted`}>{a.text}</p>{a.imageUrl && <img src={a.imageUrl} onClick={() => setViewingImage(a.imageUrl)} className="mt-2 rounded-lg border border-theme-divider shadow-lg max-w-full opacity-80 hover:opacity-100 transition-opacity cursor-zoom-in" />}</div>))}</div><form className={`mt-auto pt-4 border-t border-theme-divider flex flex-col gap-3`} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const t = (f.elements.namedItem('t') as HTMLInputElement).value; const a = (f.elements.namedItem('a') as HTMLSelectElement).value; if (t && activeProject) { addLog(a, t, activityImage); setActivityImage(undefined); f.reset(); } }}><div className="flex gap-2"><button type="button" onClick={() => activityFileRef.current?.click()} className={`rounded-xl px-3 border border-theme-divider bg-theme-bg text-theme-textMuted hover:text-theme-text hover:bg-theme-highlight transition-all`}><span className="material-symbols-outlined text-lg">add_a_photo</span></button><input type="file" ref={activityFileRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onloadend = () => setActivityImage(r.result as string); r.readAsDataURL(file); } }} className="hidden" accept="image/*" /><select name="a" className={`text-[9px] font-bold rounded-xl px-2 py-3 border border-theme-divider outline-none uppercase bg-theme-bg text-theme-textMuted focus:border-theme-orange/50`}>{db.team.map(t => <option key={t} value={t} className="bg-theme-card">{t}</option>)}</select><input name="t" className={`flex-1 text-xs font-medium rounded-xl pl-4 py-3 border border-theme-divider outline-none focus:border-theme-orange/50 transition-all bg-theme-bg text-theme-text placeholder:text-zinc-600`} placeholder="Registrar atividade..." required /><button className="bg-theme-orange text-white rounded-xl px-4 shadow-lg shadow-orange-900/20 hover:bg-orange-500 transition-all flex items-center justify-center" type="submit"><span className="material-symbols-outlined text-lg font-bold">send</span></button></div></form></div>
                    </div>

                    <div className={`lg:col-span-4 flex flex-col gap-6 transition-all duration-1000 ${!hasProject ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100'}`}>
                        <div className={`ds-card p-6 h-[288px] border ${projectHealth.border} flex flex-col relative overflow-hidden group`}>
                            <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-[60px] opacity-20 ${projectHealth.color.replace('text-', 'bg-')}`}></div>
                            
                            <div className="grid grid-cols-4 gap-2 mb-4 relative z-20">
                                <button onClick={() => setActiveHealthTab('total')} className={`flex flex-col p-2 rounded-lg border transition-all ${activeHealthTab === 'total' ? 'bg-indigo-500/20 border-indigo-500/50 scale-105 shadow-lg' : 'bg-theme-highlight border-theme-divider hover:bg-theme-highlight'}`}>
                                    <span className="text-[8px] font-bold uppercase text-indigo-300 mb-1">Total de Tarefas</span>
                                    <span className="text-xl font-black text-indigo-400">{stats.taskCount}</span>
                                    <span className="material-symbols-outlined text-indigo-500/50 absolute top-2 right-2 text-base">folder</span>
                                </button>
                                <button onClick={() => setActiveHealthTab('progress')} className={`flex flex-col p-2 rounded-lg border transition-all ${activeHealthTab === 'progress' ? 'bg-orange-500/20 border-orange-500/50 scale-105 shadow-lg' : 'bg-theme-highlight border-theme-divider hover:bg-theme-highlight'}`}>
                                    <span className="text-[8px] font-bold uppercase text-orange-300 mb-1">Em Progresso</span>
                                    <span className="text-xl font-black text-orange-400">{stats.inProgress}</span>
                                    <span className="material-symbols-outlined text-orange-500/50 absolute top-2 right-2 text-base">schedule</span>
                                </button>
                                <button onClick={() => setActiveHealthTab('done')} className={`flex flex-col p-2 rounded-lg border transition-all ${activeHealthTab === 'done' ? 'bg-emerald-500/20 border-emerald-500/50 scale-105 shadow-lg' : 'bg-theme-highlight border-theme-divider hover:bg-theme-highlight'}`}>
                                    <span className="text-[8px] font-bold uppercase text-emerald-300 mb-1">Concluídas</span>
                                    <span className="text-xl font-black text-emerald-400">{stats.don}</span>
                                    <span className="material-symbols-outlined text-emerald-500/50 absolute top-2 right-2 text-base">check_circle</span>
                                </button>
                                <button onClick={() => setActiveHealthTab('efficiency')} className={`flex flex-col p-2 rounded-lg border transition-all ${activeHealthTab === 'efficiency' ? 'bg-pink-500/20 border-pink-500/50 scale-105 shadow-lg' : 'bg-theme-highlight border-theme-divider hover:bg-theme-highlight'}`}>
                                    <span className="text-[8px] font-bold uppercase text-pink-300 mb-1">Eficiência</span>
                                    <span className="text-xl font-black text-pink-400">{stats.rate}%</span>
                                    <span className="material-symbols-outlined text-pink-500/50 absolute top-2 right-2 text-base">bolt</span>
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col justify-end relative z-10">
                                {activeHealthTab === 'efficiency' && (
                                    <div className="animate-fadeIn">
                                        <h3 className={`font-square font-bold text-[10px] uppercase tracking-[0.3em] mb-1 text-theme-textMuted`}>Saúde Geral</h3>
                                        <p className={`text-2xl font-bold ${projectHealth.color} tracking-tight drop-shadow-sm`}>{projectHealth.label}</p>
                                        <div className="mt-2 flex items-center gap-2 bg-theme-highlight px-3 py-1.5 rounded-full w-fit border border-theme-divider">
                                            <span className="material-symbols-outlined text-theme-orange text-sm">schedule</span>
                                            <span className={`text-[10px] font-bold uppercase text-theme-textMuted`}>
                                                Investido: <span className="text-theme-text">{hoursSpent}h</span>
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {activeHealthTab === 'total' && (
                                    <div className="animate-fadeIn">
                                         <h3 className="font-square font-bold text-[10px] uppercase tracking-[0.3em] mb-1 text-theme-textMuted">Disciplinas & Escopo</h3>
                                         <p className="text-2xl font-bold text-theme-text tracking-tight">{activeProject?.scopes.length || 0} <span className="text-xs text-theme-textMuted font-medium align-middle">Áreas / Disciplinas Ativas</span></p>
                                    </div>
                                )}
                                {activeHealthTab === 'progress' && (
                                    <div className="animate-fadeIn">
                                         <h3 className="font-square font-bold text-[10px] uppercase tracking-[0.3em] mb-1 text-theme-textMuted">Cronograma Ativo</h3>
                                         <p className="text-2xl font-bold text-orange-400 tracking-tight">{stats.inProgress} <span className="text-xs text-theme-textMuted font-medium align-middle">Tarefas em andamento hoje</span></p>
                                    </div>
                                )}
                                {activeHealthTab === 'done' && (
                                    <div className="animate-fadeIn">
                                         <h3 className="font-square font-bold text-[10px] uppercase tracking-[0.3em] mb-1 text-theme-textMuted">Entregas Realizadas</h3>
                                         <p className="text-2xl font-bold text-emerald-400 tracking-tight">{stats.don} <span className="text-xs text-theme-textMuted font-medium align-middle">Tarefas validadas</span></p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="absolute bottom-0 left-0 right-0 h-32 w-full overflow-hidden opacity-60 pointer-events-none">
                                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="waveGradient" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#d95e16" stopOpacity="0.6"/>
                                            <stop offset="100%" stopColor="#d95e16" stopOpacity="0.0"/>
                                        </linearGradient>
                                    </defs>
                                    <path 
                                        d={wavePath}
                                        fill="url(#waveGradient)" 
                                        stroke="#d95e16" 
                                        strokeWidth="0.5"
                                        className="drop-shadow-[0_0_10px_rgba(217,94,22,0.3)]"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div className={`ds-card p-6 h-[346px] flex flex-col overflow-hidden relative`}>
                            <div className={`flex justify-between items-center mb-5 border-b border-theme-divider pb-4 sticky top-0 bg-theme-card z-20`}>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-theme-orange">check_box</span>
                                    <h3 className={`font-square font-bold text-[10px] uppercase tracking-widest text-theme-text`}>
                                        Disciplinas e Ações
                                    </h3>
                                </div>
                                <button className="text-theme-textMuted hover:text-theme-text transition-colors" onClick={() => { setEditingScopeId(null); setShowScopeModal(true); }}>
                                    <span className="material-symbols-outlined text-xl">add_circle</span>
                                </button>
                            </div>
                            
                            <div className="flex-grow scroller overflow-y-auto space-y-3 pr-2 pb-2">
                                {activeProject?.scopes.filter(s => !memberFilter || s.resp === memberFilter || s.events.some(ev => ev.resp === memberFilter)).map(scope => (
                                    <div 
                                        key={scope.id} 
                                        className={`group flex items-center gap-4 cursor-pointer p-2 rounded-lg hover:bg-theme-highlight transition-all ${selectedScopeIdForFiles === scope.id ? 'bg-theme-highlight' : ''}`}
                                        onClick={() => setSelectedScopeIdForFiles(scope.id)}
                                    >
                                        <button className="w-5 h-5 border-2 border-theme-textMuted rounded flex items-center justify-center hover:border-theme-orange transition-colors">
                                        </button>
                                        
                                        <div className="flex flex-col flex-1 overflow-hidden">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-theme-text truncate">{scope.name}</span>
                                                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); setActiveScopeIdForEvent(scope.id); setEditingEventId(null); setShowEventModal(true); }} className="text-theme-textMuted hover:text-theme-orange" title="Nova Ação">
                                                        <span className="material-symbols-outlined text-sm">add_task</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingScopeId(scope.id); setShowScopeModal(true); }} className="text-theme-textMuted hover:text-white" title="Editar Disciplina">
                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); if(confirm('Apagar disciplina?')) onDeleteScope(scope.id); }} className="text-theme-textMuted hover:text-red-500" title="Remover Disciplina">
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <span className="text-[9px] font-black text-theme-textMuted uppercase tracking-wider truncate">
                                                {db.disciplines.find(d => d.code === scope.name)?.name || scope.name}
                                            </span>
                                            {/* RESPONSAVEL VISIVEL NA LISTA */}
                                            <span className="text-[8px] text-theme-textMuted/70 uppercase block mt-0.5 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">person</span> {scope.resp}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="mt-auto pt-4 border-t border-theme-divider">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-[9px] font-black text-theme-textMuted uppercase tracking-widest flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">groups</span> Equipe & Carga
                                    </h4>
                                    <button className="text-[9px] font-bold text-theme-textMuted hover:text-white bg-theme-highlight px-2 py-0.5 rounded" onClick={() => setShowTeamModal(true)}>Gerenciar</button>
                                </div>
                                <div className="flex gap-2 overflow-x-auto scroller pb-1">
                                    {db.team.map(member => {
                                        const count = teamStats[member]?.count || 0;
                                        if (count === 0 && !teamStats[member]?.leaderOf.length) return null; // Hide if no load
                                        const initials = member.split(' ').map((n, i) => i < 2 ? n[0] : '').join('').toUpperCase();
                                        
                                        return (
                                            <div key={member} className="flex items-center bg-[#1a1a1a] rounded-full px-2 py-1 border border-white/10 shrink-0" title={`${member}: ${count} tarefas`}>
                                                <span className="text-[8px] font-black text-white mr-2">{initials}</span>
                                                <span className="text-[8px] font-bold text-theme-textMuted">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timeline Section */}
                <div className={`transition-all duration-1000 flex flex-col gap-10 ${!hasProject ? 'opacity-0 grayscale blur-md pointer-events-none' : 'opacity-100'}`}>
                    <div className={`self-center ds-card rounded-full p-1.5 flex gap-1 no-print`}>
                        <button onClick={() => setZoomLevel(0.6)} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${zoomLevel < 0.8 ? 'bg-theme-orange text-white shadow-lg' : 'text-zinc-500 hover:text-theme-text hover:bg-theme-highlight'}`}>MACRO</button>
                        <button onClick={() => setZoomLevel(1)} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${zoomLevel >= 0.8 && zoomLevel <= 1.2 ? 'bg-theme-orange text-white shadow-lg' : 'text-zinc-500 hover:text-theme-text hover:bg-theme-highlight'}`}>NORMAL</button>
                        <button onClick={() => setZoomLevel(1.8)} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${zoomLevel > 1.2 ? 'bg-theme-orange text-white shadow-lg' : 'text-zinc-500 hover:text-theme-text hover:bg-theme-highlight'}`}>MICRO</button>
                    </div>

                    <div className="ds-card rounded-[50px] overflow-hidden">
                        <div className="bg-gradient-to-r from-theme-orange to-orange-600 py-5 text-center border-b border-theme-divider"><h2 className="font-square font-black text-white text-2xl uppercase tracking-[0.3em] drop-shadow-md">Cronograma Planejado</h2></div>
                        <div className="bg-theme-bg">
                            <Timeline 
                                project={activeProject} 
                                isExecuted={false} 
                                zoomLevel={zoomLevel} 
                                setZoomLevel={setZoomLevel} 
                                onBarClick={(sid, eid) => { setActiveChecklistIds({ sid, eid }); setShowChecklistModal(true); }} 
                                onBarContextMenu={() => {}} 
                                onAddDependency={onAddDependency} 
                            />
                        </div>
                    </div>

                    <div className="ds-card rounded-[50px] overflow-hidden border-theme-cyan/30">
                        <div className="bg-gradient-to-r from-theme-cyan/80 to-blue-600 py-5 text-center border-b border-theme-divider"><h2 className="font-square font-black text-white text-2xl uppercase tracking-[0.3em] drop-shadow-md">Cronograma Executado</h2></div>
                        <div className="bg-theme-bg">
                            <Timeline 
                                project={activeProject} 
                                isExecuted={true} 
                                zoomLevel={zoomLevel} 
                                setZoomLevel={setZoomLevel} 
                                onBarClick={(sid, eid) => { setActiveChecklistIds({ sid, eid }); setShowChecklistModal(true); }} 
                                onBarContextMenu={(sid, eid) => { setActiveScopeIdForEvent(sid); setEditingEventId(eid); setShowEventModal(true); }} 
                                onAddDependency={onAddDependency}
                            />
                        </div>
                    </div>

                    <div className={`ds-card p-6 h-[260px] flex flex-col relative overflow-hidden bg-[#252525] border-theme-divider mb-10`}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl font-square font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <span className="material-symbols-outlined text-theme-orange text-3xl">timer</span>
                                    Controle de Prazo Global
                                </h2>
                                <div className="mt-4 flex items-center gap-4">
                                    <button 
                                        onClick={() => setShowTeamModal(true)} 
                                        className="bg-[#1a1a1a] border border-white/10 hover:border-theme-orange text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all group"
                                    >
                                        <span className="material-symbols-outlined text-lg group-hover:text-theme-orange transition-colors">groups</span> Equipe Técnica
                                    </button>

                                    <div className="h-8 w-px bg-white/10 mx-2"></div>

                                    <div className="flex items-center gap-3 overflow-x-auto scroller pb-2 max-w-[800px]">
                                        <button 
                                            onClick={() => setMemberFilter(null)}
                                            className={`flex flex-col items-center px-3 py-1.5 rounded-lg border transition-all shrink-0 ${!memberFilter ? 'bg-theme-orange border-theme-orange' : 'bg-[#1a1a1a] border-white/10 hover:border-white/30'}`}
                                        >
                                            <span className={`text-[9px] font-black uppercase ${!memberFilter ? 'text-white' : 'text-theme-textMuted'}`}>Todos</span>
                                        </button>
                                        
                                        {db.team.map(member => {
                                            const isLeader = teamStats[member]?.leaderOf.length > 0;
                                            const actionCount = teamStats[member]?.count || 0;
                                            const isActive = memberFilter === member;
                                            
                                            return (
                                                <button 
                                                    key={member}
                                                    onClick={() => setMemberFilter(isActive ? null : member)}
                                                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border transition-all shrink-0 group ${isActive ? 'bg-white/10 border-theme-orange' : 'bg-[#1a1a1a] border-white/10 hover:bg-white/5'}`}
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className={`text-[9px] font-bold uppercase truncate max-w-[100px] ${isActive ? 'text-white' : 'text-theme-textMuted group-hover:text-white'}`}>{member}</span>
                                                        <div className="flex gap-2 mt-0.5">
                                                            {isLeader && <span className="text-[7px] font-black text-theme-orange bg-orange-900/30 px-1 rounded uppercase">LÍDER</span>}
                                                            <span className="text-[7px] font-bold text-zinc-500">{actionCount} AÇÕES</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                <button onClick={() => setShowDisciplinesModal(true)} className="bg-[#1a1a1a] border border-white/10 text-theme-textMuted hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all hover:bg-white/5">
                                    <span className="material-symbols-outlined text-sm">view_list</span> Disciplinas
                                </button>
                                <button onClick={() => setShowSettingsModal(true)} className="bg-[#1a1a1a] border border-white/10 text-theme-textMuted hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all hover:bg-white/5">
                                    <span className="material-symbols-outlined text-sm">settings</span> Ajustar Período
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center pb-2">
                            <div className="h-6 w-full bg-[#1a1a1a] rounded-full relative overflow-hidden border border-white/5 shadow-inner">
                                <div 
                                    className="h-full bg-gradient-to-r from-orange-900 to-theme-orange transition-all duration-1000 ease-out"
                                    style={{ width: `${globalProgress}%` }}
                                />
                                <div 
                                    className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10 transition-all duration-1000 ease-out"
                                    style={{ left: `${globalProgress}%` }}
                                />
                            </div>
                            
                            <div className="flex justify-between mt-4">
                                <div className="flex flex-col items-start">
                                    <span className="text-[9px] font-black text-theme-cyan uppercase tracking-widest mb-1">START</span>
                                    <div className="bg-[#1a1a1a] border border-white/10 px-3 py-1 rounded-lg text-xs font-bold text-theme-textMuted">
                                        {activeProject ? new Date(activeProject.timelineStart).toLocaleDateString() : '--/--/--'}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-theme-green uppercase tracking-widest mb-1">ENTREGA</span>
                                    <div className="bg-[#1a1a1a] border border-white/10 px-3 py-1 rounded-lg text-xs font-bold text-theme-textMuted">
                                        {activeProject ? new Date(activeProject.timelineEnd).toLocaleDateString() : '--/--/--'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <LodModal 
                isOpen={showLodModal} 
                lods={db.lods} 
                activeLod={db.activeLod} 
                onClose={() => setShowLodModal(false)} 
                onSelect={(l) => {
                    setDb(prev => ({ ...prev, activeLod: l }));
                    setShowLodModal(false);
                }}
                onAdd={(l) => setDb(prev => ({ ...prev, lods: [...prev.lods, l] }))}
                onRemove={(l) => setDb(prev => ({ ...prev, lods: prev.lods.filter(x => x !== l) }))}
                onReorder={(l) => setDb(prev => ({ ...prev, lods: l }))}
            />

            <CompanyModal 
                isOpen={showCompanyModal} 
                companies={db.companies} 
                onClose={() => setShowCompanyModal(false)} 
                onSelect={(id) => {
                    setDb(prev => ({ ...prev, activeCompanyId: id, activeProjectId: null }));
                    setShowCompanyModal(false);
                }}
                onAdd={(name, logoUrl) => setDb(prev => ({ ...prev, companies: [...prev.companies, { id: Date.now(), name, logoUrl }] }))}
                onRemove={(id) => setDb(prev => ({ ...prev, companies: prev.companies.filter(c => c.id !== id) }))}
                onReorder={(c) => setDb(prev => ({ ...prev, companies: c }))}
            />

            <ProjectModal 
                isOpen={showProjectModal} 
                companyName={activeCompany?.name || ''} 
                projects={db.projects.filter(p => p.companyId === db.activeCompanyId && p.lod === db.activeLod)} 
                onClose={() => setShowProjectModal(false)} 
                onSelect={(id) => { setDb(prev => ({ ...prev, activeProjectId: id })); setShowProjectModal(false); }}
                onAdd={(name, logo, cover) => {
                    setDb(prev => ({ ...prev, projects: [...prev.projects, { id: Date.now(), companyId: db.activeCompanyId!, lod: db.activeLod, name, logoUrl: logo, coverUrl: cover, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), timelineStart: '2026-01-01', timelineEnd: '2026-12-31', activities: [], scopes: [] }] }));
                    setShowProjectModal(false);
                }}
                onDelete={onDeleteProject}
                onEdit={onEditProject}
            />

            <ScopeModal 
                isOpen={showScopeModal} 
                scope={selectedScope || (editingScopeId ? activeProject?.scopes.find(s => s.id === editingScopeId) || null : null)}
                disciplines={db.disciplines}
                onClose={() => { setShowScopeModal(false); setEditingScopeId(null); }}
                onManage={() => setShowDisciplinesModal(true)}
                team={db.team}
                onSave={(name, start, color, status, pWeek, resp) => {
                    if (!activeProject) return;
                    setDb(prev => ({
                        ...prev,
                        projects: prev.projects.map(p => p.id === activeProject.id ? {
                            ...p,
                            updatedAt: new Date().toISOString(),
                            scopes: editingScopeId 
                                ? p.scopes.map(s => s.id === editingScopeId ? { ...s, name, startDate: start, colorClass: color, status, protocolWeek: pWeek, resp } : s)
                                : [...p.scopes, { id: `sc${Date.now()}`, name, colorClass: color, startDate: start, resp, status, protocolWeek: pWeek, events: [] }]
                        } : p)
                    }));
                    setShowScopeModal(false);
                    setEditingScopeId(null);
                    addLog("SISTEMA", editingScopeId ? `DISCIPLINA ATUALIZADA: ${name}` : `NOVA DISCIPLINA: ${name}`);
                }}
            />

            <EventModal 
                isOpen={showEventModal} 
                team={db.team} 
                event={editingEvent}
                onClose={() => { setShowEventModal(false); setEditingEventId(null); }}
                onSave={(title, resp, start, end, checklistStr) => {
                    if (!activeProject || !activeScopeIdForEvent) return;
                    const checklistItems = checklistStr.split('\n').filter(t => t.trim()).map(t => ({ text: t.trim(), done: false }));
                    setDb(prev => ({
                        ...prev,
                        projects: prev.projects.map(p => p.id === activeProject.id ? {
                            ...p,
                            updatedAt: new Date().toISOString(),
                            scopes: p.scopes.map(s => s.id === activeScopeIdForEvent ? {
                                ...s,
                                events: editingEventId
                                    ? s.events.map(e => e.id === editingEventId ? { ...e, title, resp, startDate: start, endDate: end, checklist: checklistItems } : e)
                                    : [...s.events, { id: `ev${Date.now()}`, title, resp, startDate: start, endDate: end, checklist: checklistItems, completed: false }]
                            } : s)
                        } : p)
                    }));
                    setShowEventModal(false);
                    setEditingEventId(null);
                    addLog("SISTEMA", editingEventId ? `AÇÃO ATUALIZADA: ${title}` : `NOVA AÇÃO: ${title}`);
                }}
            />

            <ChecklistModal 
                isOpen={showChecklistModal} 
                event={activeChecklistIds ? activeProject?.scopes.find(s => s.id === activeChecklistIds.sid)?.events.find(e => e.id === activeChecklistIds.eid) || null : null}
                project={activeProject}
                onClose={() => setShowChecklistModal(false)}
                onToggleCheck={(idx) => {
                    if (!activeProject || !activeChecklistIds) return;
                    setDb(prev => ({
                        ...prev,
                        projects: prev.projects.map(p => p.id === activeProject.id ? {
                            ...p,
                            scopes: p.scopes.map(s => s.id === activeChecklistIds.sid ? {
                                ...s,
                                events: s.events.map(e => e.id === activeChecklistIds.eid ? { ...e, checklist: e.checklist.map((it, i) => i === idx ? { ...it, done: !it.done } : it) } : e)
                            } : s)
                        } : p)
                    }));
                }}
                onComplete={() => {
                    if (!activeProject || !activeChecklistIds) return;
                    setDb(prev => ({
                        ...prev,
                        projects: prev.projects.map(p => p.id === activeProject.id ? {
                            ...p,
                            scopes: p.scopes.map(s => s.id === activeChecklistIds.sid ? {
                                ...s,
                                events: s.events.map(e => e.id === activeChecklistIds.eid ? { ...e, completed: !e.completed } : e)
                            } : s)
                        } : p)
                    }));
                    if (!editingEvent?.completed) addLog("SISTEMA", "AÇÃO VALIDADA / CONCLUÍDA");
                    setShowChecklistModal(false);
                }}
                onToggleLink={(targetId) => {
                    if (activeChecklistIds) onToggleDependency(activeChecklistIds.sid, activeChecklistIds.eid, targetId);
                }}
                onChangeType={(targetId) => {
                    if (activeChecklistIds) onChangeDependencyType(activeChecklistIds.sid, activeChecklistIds.eid, targetId);
                }}
                onEdit={() => {
                    if (activeChecklistIds) {
                        setActiveScopeIdForEvent(activeChecklistIds.sid);
                        setEditingEventId(activeChecklistIds.eid);
                        setShowChecklistModal(false);
                        setShowEventModal(true);
                    }
                }}
            />

            <TeamModal 
                isOpen={showTeamModal} 
                team={db.team} 
                onClose={() => setShowTeamModal(false)}
                onAdd={(name) => setDb(prev => ({ ...prev, team: [...prev.team, name] }))}
                onRemove={(idx) => setDb(prev => ({ ...prev, team: prev.team.filter((_, i) => i !== idx) }))}
            />

            <TimelineSettingsModal 
                isOpen={showSettingsModal} 
                project={activeProject} 
                onClose={() => setShowSettingsModal(false)}
                onSave={(start, end) => {
                    if (!activeProject) return;
                    setDb(prev => ({
                        ...prev,
                        projects: prev.projects.map(p => p.id === activeProject.id ? { ...p, timelineStart: start, timelineEnd: end } : p)
                    }));
                    setShowSettingsModal(false);
                }}
            />

            <AdminSettingsModal 
                isOpen={showAdminModal} 
                theme={theme} 
                onClose={() => setShowAdminModal(false)}
                onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                onPrint={printDashboard}
                onExport={exportHTML}
                onExportPython={exportPython}
            />

            <DisciplinesManagerModal
                isOpen={showDisciplinesModal}
                disciplines={db.disciplines}
                onClose={() => setShowDisciplinesModal(false)}
                onAdd={(d) => setDb(prev => ({ ...prev, disciplines: [...prev.disciplines, d] }))}
                onUpdate={(oldCode, d) => setDb(prev => ({ ...prev, disciplines: prev.disciplines.map(x => x.code === oldCode ? d : x) }))}
                onRemove={(code) => setDb(prev => ({ ...prev, disciplines: prev.disciplines.filter(x => x.code !== code) }))}
                onReorder={(d) => setDb(prev => ({ ...prev, disciplines: d }))}
            />
        </div>
    );
};