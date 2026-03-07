# Редактор JSON-конфига

Проект мигрирован на `React + TypeScript + MUI` с дизайн-токенами.

## Стек
- React 19
- TypeScript
- Vite
- MUI
- dnd-kit

## Команды
```bash
npm install
npm run dev
npm run build
```

## Архитектура
- `src/design/*` — токены и тема
- `src/shared/*` — базовые hooks и UI примитивы
- `src/features/editor/model/*` — JSON-модель, нормализация, валидация
- `src/features/editor/components/*` — UI блоки редактора

## Ключевые принципы
- Единый источник истины по стилям через токены
- Разделение UI и бизнес-логики
- Единые правила UX в `UI_RULES.md`
