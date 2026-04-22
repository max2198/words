// Загрузка слов из JSON-файла
let words = [];

const STORAGE_KEY = 'wordsProgress';

async function loadWords() {
    try {
        const response = await fetch('words.json');
        words = await response.json();
        console.log('Слова загружены:', words.length);
        initApp();
    } catch (error) {
        console.error('Ошибка загрузки слов:', error);
        initApp();
    }
}

// ========================
// Система повторения SM-2
// ========================
class SpacedRepetition {
    constructor() {
        this.wordList = [];
        this.currentWordIndex = 0;
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.language = 'english'; // 'english' or 'russian'
        this.lessonWords = [];
        this.lessonComplete = false;
        this.answerHistory = [];
        this.cardFlipped = false;
        this.progress = this.loadProgress();
    }

    // ========================
    // localStorage методы
    // ========================
    loadProgress() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('Ошибка загрузки прогресса:', e);
        }
        return this.createDefaultProgress();
    }

    saveProgress() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
        } catch (e) {
            console.warn('Ошибка сохранения прогресса:', e);
        }
    }

    createDefaultProgress() {
        const wordProgress = {};
        words.forEach(word => {
            const key = word.english.toLowerCase();
            wordProgress[key] = {
                interval: 0,
                repetitionCount: 0,
                easFactor: 2.5,
                lastReview: null,
                nextReview: Date.now(),
                status: 'new' // 'new', 'learning', 'review'
            };
        });
        return {
            wordProgress: wordProgress,
            totalReviews: 0,
            lessonsCompleted: 0
        };
    }

    getWordProgress(word) {
        const key = word.english.toLowerCase();
        if (!this.progress.wordProgress[key]) {
            this.progress.wordProgress[key] = {
                interval: 0,
                repetitionCount: 0,
                easFactor: 2.5,
                lastReview: null,
                nextReview: Date.now(),
                status: 'new'
            };
        }
        return this.progress.wordProgress[key];
    }

    // ========================
    // SM-2 алгоритм
    // ========================
    /**
     * Применяет алгоритм SM-2 к слову и возвращает новый прогресс.
     * @param {number} quality - оценка от 0 до 5
     *   0-2: "Забыл" (слово не вспомнено)
     *   3-5: "Помню" (вспомнено с усилиями/легко)
     */
    applySM2(word, quality) {
        const wp = this.getWordProgress(word);
        
        wp.totalReviews = (wp.totalReviews || 0) + 1;
        this.progress.totalReviews = (this.progress.totalReviews || 0) + 1;

        if (quality >= 3) {
            // Хороший ответ — увеличиваем интервал
            wp.repetitionCount += 1;

            if (wp.repetitionCount === 1) {
                wp.interval = 1;
            } else if (wp.repetitionCount === 2) {
                wp.interval = 2;
            } else {
                wp.interval = Math.ceil(wp.interval * wp.easFactor);
            }

            // Корректировка EAS-фактора
            wp.easFactor = wp.easFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (wp.easFactor < 1.3) wp.easFactor = 1.3;

            wp.status = wp.repetitionCount > 1 ? 'review' : 'learning';
            
            // Устанавливаем следующую дату повторения
            wp.nextReview = Date.now() + wp.interval * 24 * 60 * 60 * 1000;

        } else {
            // Плохой ответ — сбрасываем
            wp.repetitionCount = 0;
            wp.interval = 1;
            wp.status = 'learning';
            
            // Корректировка EAS-фактора даже при ошибке
            wp.easFactor = wp.easFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (wp.easFactor < 1.3) wp.easFactor = 1.3;

            // Повторение через 1 день
            wp.nextReview = Date.now() + wp.interval * 24 * 60 * 60 * 1000;
        }

        wp.lastReview = Date.now();
        this.saveProgress();
        return wp;
    }

    // ========================
    // Выбор слов для урока
    // ========================
    selectLessonWords() {
        const now = Date.now();
        const dueWords = [];
        const newWords = [];

        // Классифицируем слова
        words.forEach(word => {
            const wp = this.getWordProgress(word);
            if (wp.status === 'new' || wp.nextReview > now) {
                newWords.push(word);
            } else {
                dueWords.push(word);
            }
        });

        const MAX_LESSON_SIZE = 10;
        const lesson = [];

        if (dueWords.length + newWords.length <= MAX_LESSON_SIZE) {
            // Все слова помещаются
            lesson.push(...dueWords, ...newWords);
        } else if (dueWords.length >= MAX_LESSON_SIZE) {
            // Только слова для повторения
            const shuffled = dueWords.sort(() => 0.5 - Math.random());
            lesson.push(...shuffled.slice(0, MAX_LESSON_SIZE));
        } else {
            // Комбинация: гарантируем минимум 1 новое слово
            const newWordCount = Math.max(1, MAX_LESSON_SIZE - dueWords.length);
            const dueWordCount = MAX_LESSON_SIZE - newWordCount;

            // Перемешиваем и выбираем
            const shuffledDue = dueWords.sort(() => 0.5 - Math.random());
            const shuffledNew = newWords.sort(() => 0.5 - Math.random());

            lesson.push(...shuffledDue.slice(0, dueWordCount));
            lesson.push(...shuffledNew.slice(0, newWordCount));
        }

        // Помечаем слова флагами
        return lesson.map(word => {
            const wp = this.getWordProgress(word);
            return {
                ...word,
                isNew: wp.status === 'new',
                isDue: wp.status !== 'new'
            };
        });
    }

    // ========================
    // Статистика
    // ========================
    getStats() {
        let newCount = 0;
        let learningCount = 0;
        let reviewCount = 0;
        const now = Date.now();

        words.forEach(word => {
            const wp = this.getWordProgress(word);
            if (wp.status === 'new') newCount++;
            else if (wp.status === 'learning') learningCount++;
            else if (wp.nextReview <= now) reviewCount++;
        });

        return {
            new: newCount,
            learning: learningCount,
            review: reviewCount,
            mastered: this.progress.lessonsCompleted || 0,
            totalReviews: this.progress.totalReviews || 0
        };
    }

    // ========================
    // UI методы
    // ========================
    updateProgressBar() {
        const progressBar = document.getElementById('progressBar');
        if (!progressBar) return;
        
        progressBar.innerHTML = '';
        
        const totalWords = this.lessonWords.length;
        for (let i = 0; i < totalWords; i++) {
            const progressItem = document.createElement('div');
            progressItem.className = 'progress-circle';
            if (i < this.answerHistory.length) {
                progressItem.classList.add(this.answerHistory[i] ? 'correct' : 'incorrect');
            } else {
                progressItem.classList.add('pending');
            }
            progressBar.appendChild(progressItem);
        }
    }

    initLesson() {
        this.lessonWords = this.selectLessonWords();
        this.currentWordIndex = 0;
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.lessonComplete = false;
        this.answerHistory = [];
        this.cardFlipped = false;
        
        // Сбрасываем карточку
        const flashcard = document.getElementById('flashcard');
        if (flashcard) {
            flashcard.style.transition = 'transform 0.6s ease';
            flashcard.style.transform = 'rotateY(0deg)';
        }

        // Скрываем результаты
        const lessonComplete = document.getElementById('lessonComplete');
        if (lessonComplete) {
            lessonComplete.style.display = 'none';
        }

        // Обновляем статистику на главной
        this.updateHeaderStats();
        
        this.updateDisplay();
        this.updateProgressBar();
    }

    updateHeaderStats() {
        const stats = this.getStats();
        const dueStats = document.getElementById('dueStats');
        if (dueStats) {
            dueStats.textContent = `Повторение: ${stats.review} | Новые: ${stats.new}`;
        }
    }

    updateDisplay() {
        this.updateDisplayWords();
        this.updateDisplayCounters();
    }

    updateDisplayCounters() {
        if (this.lessonComplete) return;
        
        const wordCountElement = document.getElementById('wordCount');
        const progressElement = document.getElementById('progress');
        
        wordCountElement.textContent = `Слово ${this.currentWordIndex + 1} из ${this.lessonWords.length}`;
        
        const progress = Math.round(((this.currentWordIndex + 1) / this.lessonWords.length) * 100);
        progressElement.textContent = `Прогресс: ${progress}%`;
    }

    updateDisplayWords() {
        if (this.lessonComplete) return;
        
        const word = this.lessonWords[this.currentWordIndex];
        
        const wordFront = document.getElementById('wordFront');
        const transcriptionFront = document.getElementById('transcriptionFront');
        const wordBack = document.getElementById('wordBack');
        const transcriptionBack = document.getElementById('transcriptionBack');
        const newBadge = document.getElementById('newWordBadge');
        
        if (this.language === 'english') {
            wordFront.textContent = word.english;
            transcriptionFront.textContent = word.transcription;
            wordBack.textContent = word.russian;
            transcriptionBack.textContent = word.transcription;
        } else {
            wordFront.textContent = word.russian;
            transcriptionFront.textContent = word.transcription;
            wordBack.textContent = word.english;
            transcriptionBack.textContent = word.transcription;
        }

        // Показываем/скрываем метку "Новое слово"
        if (newBadge) {
            if (word.isNew) {
                newBadge.textContent = 'Новое слово';
                newBadge.style.display = 'block';
            } else {
                newBadge.style.display = 'none';
            }
        }
    }

    flipCard() {
        const flashcard = document.getElementById('flashcard');
        this.cardFlipped = !this.cardFlipped;
        flashcard.style.transition = 'transform 0.6s ease';
        flashcard.style.transform = this.cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    }

    nextWord() {
        if (this.currentWordIndex < this.lessonWords.length - 1) {
            this.currentWordIndex++;
            const flashcard = document.getElementById('flashcard');

            if (this.cardFlipped) {
                const word = this.lessonWords[this.currentWordIndex];
                const wordFront = document.getElementById('wordFront');
                const transcriptionFront = document.getElementById('transcriptionFront');
                if (this.language === 'english') {
                    wordFront.textContent = word.english;
                    transcriptionFront.textContent = word.transcription;
                } else {
                    wordFront.textContent = word.russian;
                    transcriptionFront.textContent = word.transcription;
                }
                flashcard.style.transition = 'transform 0.6s ease';
                flashcard.style.transform = 'rotateY(0deg)';
                setTimeout(() => {
                    this.cardFlipped = false;
                    const wordBack = document.getElementById('wordBack');
                    const transcriptionBack = document.getElementById('transcriptionBack');
                    if (this.language === 'english') {
                        wordBack.textContent = word.russian;
                        transcriptionBack.textContent = word.transcription;
                    } else {
                        wordBack.textContent = word.english;
                        transcriptionBack.textContent = word.transcription;
                    }
                    this.updateDisplayCounters();
                }, 284);
            } else {
                this.updateDisplayWords();
                this.updateDisplayCounters();
            }
        } else {
            this.lessonComplete = true;
            this.showResults();
        }
    }

    prevWord() {
        if (this.currentWordIndex > 0) {
            this.currentWordIndex--;
            const flashcard = document.getElementById('flashcard');

            if (this.cardFlipped) {
                flashcard.style.transition = 'transform 0.6s ease';
                flashcard.style.transform = 'rotateY(0deg)';
                setTimeout(() => {
                    this.cardFlipped = false;
                    this.updateDisplayWords();
                    this.updateDisplayCounters();
                }, 300);
            } else {
                this.updateDisplayWords();
                this.updateDisplayCounters();
            }
        }
    }

    showResults() {
        this.progress.lessonsCompleted = (this.progress.lessonsCompleted || 0) + 1;
        this.saveProgress();

        const lessonComplete = document.getElementById('lessonComplete');
        const correctCount = document.getElementById('correctCount');
        const incorrectCount = document.getElementById('incorrectCount');
        
        correctCount.textContent = this.correctCount;
        incorrectCount.textContent = this.incorrectCount;
        
        lessonComplete.style.display = 'block';
        
        this.updateProgressBar();
        this.updateHeaderStats();
    }

    handleDifficulty(difficulty) {
        if (this.lessonComplete) return;
        
        const word = this.lessonWords[this.currentWordIndex];
        
        if (difficulty === 'again') {
            // "Забыл" — quality = 1
            this.incorrectCount++;
            this.answerHistory.push(false);
            this.applySM2(word, 1);
        } else {
            // "Помню" — quality = 4 (хороший ответ)
            this.correctCount++;
            this.answerHistory.push(true);
            this.applySM2(word, 4);
        }
        
        this.updateProgressBar();
        this.nextWord();
    }

    toggleLanguage() {
        this.language = this.language === 'english' ? 'russian' : 'english';
        const langToggle = document.getElementById('langToggle');
        langToggle.textContent = this.language === 'english' ? 'Русский' : 'English';
        this.updateDisplay();
    }
}

// ========================
// Инициализация приложения
// ========================
let app = null;

function initApp() {
    app = new SpacedRepetition();
    app.initLesson();

    // Обработчики событий
    document.getElementById('flashcard').addEventListener('click', () => {
        app.flipCard();
    });

    document.getElementById('langToggle').addEventListener('click', () => {
        app.toggleLanguage();
    });

    document.querySelectorAll('.difficulty-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const difficulty = e.target.dataset.difficulty;
            app.handleDifficulty(difficulty);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !app.lessonComplete) {
            e.preventDefault();
            app.flipCard();
        }
        if (e.code === 'ArrowRight' && !app.lessonComplete) {
            app.nextWord();
        }
        if (e.code === 'ArrowLeft' && !app.lessonComplete) {
            app.prevWord();
        }
    });

    document.getElementById('restartBtn').addEventListener('click', () => {
        app.initLesson();
    });

    // Обновляем статистику при загрузке
    app.updateHeaderStats();

    // Инициализируем скрытую кнопку прогресса
    initAdminTrigger();
}

// ========================
// Скрытая кнопка прогресса
// ========================
function initAdminTrigger() {
    const trigger = document.getElementById('adminTrigger');
    const modal = document.getElementById('progressModal');
    const closeBtn = document.getElementById('closeProgressModal');
    const overlay = document.getElementById('progressModalOverlay');

    if (!trigger || !modal) return;

    function openModal() {
        if (!app) return;
        populateProgressTable();
        modal.style.display = 'flex';
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    trigger.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

function populateProgressTable() {
    if (!app) return;

    const tbody = document.getElementById('progressTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const now = Date.now();
    const statusLabels = {
        new: 'Новое',
        learning: 'Изучается',
        review: 'Повторение'
    };

    words.forEach(word => {
        const wp = app.getWordProgress(word);
        const tr = document.createElement('tr');

        // Статус
        let statusClass = wp.status;
        let statusText = statusLabels[wp.status] || wp.status;
        if (wp.interval >= 7 && wp.repetitionCount >= 5) {
            statusClass = 'mastered';
            statusText = 'Изучено';
        }

        // Интервал
        let intervalText = '—';
        if (wp.status !== 'new') {
            if (wp.interval >= 30) {
                intervalText = wp.interval + ' дн.';
            } else if (wp.interval >= 1) {
                intervalText = wp.interval + ' дн.';
            }
        }

        // Следующая повторка
        let dueText = '—';
        let dueClass = 'ok';
        if (wp.status === 'new') {
            dueText = 'Не назначено';
            dueClass = 'ok';
        } else {
            const nextDate = new Date(wp.nextReview);
            const nowDate = new Date();
            const isOverdue = wp.nextReview < now;
            const isSoon = !isOverdue && (wp.nextReview - now) < (2 * 24 * 60 * 60 * 1000);

            if (isOverdue) {
                dueClass = 'overdue';
                dueText = 'Просрочено';
            } else if (isSoon) {
                dueClass = 'soon';
                dueText = 'Скоро';
            } else {
                dueClass = 'ok';
            }

            const day = String(nextDate.getDate()).padStart(2, '0');
            const month = String(nextDate.getMonth() + 1).padStart(2, '0');
            const hours = String(nextDate.getHours()).padStart(2, '0');
            dueText = day + '.' + month + ' ' + hours + ':00';
        }

        tr.innerHTML = `
            <td>${word.english}</td>
            <td>${word.russian}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${intervalText}</td>
            <td class="due-date ${dueClass}">${dueText}</td>
        `;

        tbody.appendChild(tr);
    });
}

// Загружаем слова при запуске
loadWords();
