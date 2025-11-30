default:
	@make run

run:
	python main.py

web:
	pygbag main.py

web-build:
	pygbag --build main.py

init:
	@pip install -U pip; \
	pip install -e ".[dev,ai]"; \
	pre-commit install; \

pre-commit:
	pre-commit install

pre-commit-all:
	pre-commit run --all-files

format:
	black .

lint:
	flake8 --config=../.flake8 --output-file=./coverage/flake8-report --format=default

ai:
	python -m rl.train --viz --seed 1

ai-easy:
	# Curriculum: train first on static pipes with center reward shaping
	python -m rl.train --viz --seed 1 --no-moving-gaps --center-reward 0.01 --train-steps 150000

ai-moving-easy:
	# Slightly easier moving pipes: smaller amplitude/frequency, with center reward
	python -m rl.train --viz --seed 1 --gap-amp-px 10.0 --gap-freq-hz 0.25 --center-reward 0.01 --train-steps 300000

eval:
	python -m rl.train --eval checkpoints/best.pt --render

eval-web:
	uvicorn server.ai_server:app --reload --port 8765

ai-resume:
	python -m rl.train --resume checkpoints/best.pt --viz --seed 1