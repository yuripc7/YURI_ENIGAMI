import { DB } from './types';

const DEFAULT_DISCIPLINES = [
    { code: 'EST', name: 'Estrutura', color: '#9D9DFF' },
    { code: 'ARQ', name: 'Arquitetura', color: '#FF8000' },
    { code: 'AUT', name: 'Automação predial', color: '#EFBB4E' },
    { code: 'VCE', name: 'Ventilação, Climatização e Exaustão', color: '#3382D0' },
    { code: 'ELE', name: 'Elétrica, Telecom', color: '#3A985B' },
    { code: 'INT', name: 'Arquitetura de Interiores', color: '#646464' },
    { code: 'COR', name: 'Coordenadora e/ou Compatibilizadora', color: '#FF8C8C' },
    { code: 'SDR', name: 'Sanitário', color: '#5402B7' },
    { code: 'HID', name: 'Hidráulica', color: '#78BEE0' },
    { code: 'LUM', name: 'Luminotécnico', color: '#E691C1' },
    { code: 'PCI', name: 'Proteção Contra Incêndio', color: '#EA0000' },
    { code: 'PL', name: 'Projeto Legal', color: '#804000' },
    { code: 'PSG', name: 'Paisagismo', color: '#7EA431' },
    { code: 'EPR', name: 'Escada Pressurizada', color: '#800080' },
    { code: 'ALV', name: 'Alvenarias e Vedações', color: '#9B3200' },
    { code: 'SPD', name: 'Sist. de Prev. Descargas Atmosféricas', color: '#006C6C' },
    { code: 'TOP', name: 'Topografia', color: '#CD853F' },
];

export const INITIAL_DB: DB = {
    activeLod: "",
    activeCompanyId: null,
    activeProjectId: null,
    lods: [
        "EV_ ESTUDO DE VIABILIDADE",
        "EP_ ESTUDO PRELIMINAR",
        "AP_ ANTEPROJETO",
        "PL_ PROJETO LEGAL",
        "EX_ EXECUTIVO"
    ],
    companies: [
        { id: 1, name: "EMPRESA DEMO" },
        { id: 1770419058245, name: "TONOLHER" },
        { id: 1770419072614, name: "ENIGAMI" }
    ],
    disciplines: DEFAULT_DISCIPLINES,
    projects: [
        {
            id: 1770419126261,
            companyId: 1770419058245,
            lod: "EV",
            name: "SKY VIEW",
            coverUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1000&auto=format&fit=crop", // Placeholder facade
            createdAt: "2026-02-06T23:05:26.261Z",
            updatedAt: "2026-02-06T23:10:24.598Z",
            timelineStart: "2026-01-01",
            timelineEnd: "2026-12-31",
            activities: [
                { date: "06/02 20:05", author: "System", text: "Resp. ARQ: Eng. Roberto" },
                { date: "06/02 20:06", author: "Admin", text: "PROJETO INICIADO " },
                { date: "06/02 20:10", author: "System", text: "Resp. TOP: YURI" }
            ],
            scopes: [
                {
                    id: "sc1770419144816",
                    name: "ARQ",
                    colorClass: "#FF8000",
                    startDate: "2026-02-06",
                    resp: "Arq. Isabela",
                    status: 'walking',
                    events: [
                        {
                            id: "ev1770419256185",
                            title: "ARQ",
                            resp: "Arq. Isabela",
                            startDate: "2026-02-06",
                            endDate: "2026-02-25", // Extended to show red bar (planned was 19)
                            plannedStartDate: "2026-02-06",
                            plannedEndDate: "2026-02-19",
                            checklist: [{ text: "PLANTA BAIXA", done: true }],
                            completed: false
                        }
                    ]
                }
            ]
        }
    ],
    team: [
        "Arq. Yuri",
        "Arq. Lourraine",
        "Eng. Lucas",
        "Arq. Isabela",
        "Mkt Gisele",
        "Gugu (guzinho)"
    ]
};