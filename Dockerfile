# Используем легкий образ Python
FROM python:3.10-slim

# Устанавливаем рабочую папку
WORKDIR /app

# Копируем зависимости и устанавливаем их
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь код проекта
COPY . .

# Укажи порт, на котором работает твой Python-скрипт (например, 8000)
EXPOSE 8000

# Команда для запуска (замени main.py на имя своего главного файла)
CMD ["python", "main.py"]
