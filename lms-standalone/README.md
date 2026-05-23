# LMS Standalone — Incubadora

> Espacio de incubación para el **producto LMS independiente** (plataforma de capacitación + cursos portables), separado del PMS Zenix. Vive aquí temporalmente porque el agente no puede crear repos fuera de `abrahag40/zenix`; cuando exista el repo definitivo, este directorio se **extrae limpio** (copiar la carpeta o `git subtree split`).

---

## Por qué está aquí

El plan es un proyecto totalmente aislado de Zenix, con dos productos:

1. **La plataforma LMS** — solución de capacitación vendida como medio, con stacks tecnológicos variables según el objetivo (HTML básico → Phaser → Unity/Unreal).
2. **Los cursos como archivos portables** — vendibles para montarse en la plataforma que ya usa el cliente (SuccessFactors y alternativas) vía SCORM/xAPI/cmi5, sin nuestra plataforma.

La especificación fundacional completa (misión, alcance, arquitectura engine/content, fundamentos psicopedagógicos, modelo comercial Cialdini+SDT, análisis de competencia, catálogo de cursos, portabilidad, certificación, roadmap y bibliografía) está en el **genesis prompt**:

➡️ [`docs/zenix-learning/STANDALONE-LMS-GENESIS-PROMPT.md`](../docs/zenix-learning/STANDALONE-LMS-GENESIS-PROMPT.md)

Ese `.md` es el primer prompt a ejecutar en el repo nuevo.

---

## Contenido actual

```
lms-standalone/
└── games/
    └── game-a-auditoria-sorpresa/   Game A "Auditoría Sorpresa: Distintivo H
                                     Simulator" — Phaser 3 + TS + Vite, jugable
                                     con assets placeholder. Capstone del Módulo 3
                                     del curso Distintivo H + NOM-035.
```

## Aislamiento del Turborepo

Este directorio **no** está en los `workspaces` (`apps/*`, `packages/*`) del `package.json` raíz de Zenix, así que `npm install` del monorepo no lo toca. Cada subproyecto aquí gestiona sus propias dependencias.

## Ruta de extracción al repo definitivo

1. Crear el repo vacío en GitHub (p. ej. `abrahag40/lms-platform`).
2. Copiar `lms-standalone/` (o `git subtree split --prefix=lms-standalone`).
3. Ejecutar el genesis prompt como primer prompt de ese repo.
4. Borrar `lms-standalone/` de la rama de Zenix una vez migrado.
