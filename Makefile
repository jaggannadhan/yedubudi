.PHONY: install run build stop clean install-tts run-tts

PORT ?= 5173

install:
	@cd frontend && npm install

run:
	@cd frontend && npm run dev -- --port $(PORT)

build:
	@cd frontend && npm run build

stop:
	@lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || true
	@lsof -ti :8765 | xargs kill -9 2>/dev/null || true
	@echo "Stopped servers"

clean:
	@rm -rf frontend/dist frontend/node_modules

install-tts:
	@cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

run-tts:
	@cd backend && . .venv/bin/activate && python3 server.py
