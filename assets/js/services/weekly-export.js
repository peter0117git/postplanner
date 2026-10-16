(function (global) {
    'use strict';

    const WEEKDAY_NAMES = Object.freeze([
        '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'
    ]);

    function parseDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
        if (
            date.getFullYear() !== Number(match[1]) ||
            date.getMonth() !== Number(match[2]) - 1 ||
            date.getDate() !== Number(match[3])
        ) return null;
        return date;
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function shiftDate(dateString, offsetDays) {
        const date = parseDate(dateString);
        if (!date) throw new Error('日期格式必須為 YYYY-MM-DD');
        date.setDate(date.getDate() + Number(offsetDays || 0));
        return formatDate(date);
    }

    function getWeekStart(anchorDate) {
        const date = parseDate(anchorDate);
        if (!date) throw new Error('日期格式必須為 YYYY-MM-DD');
        const daysFromMonday = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - daysFromMonday);
        return formatDate(date);
    }

    function normalizeText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .join('\n');
    }

    function formatPostLine(post, getPlainText) {
        const theme = String(post?.theme || '').trim();
        const title = String(post?.title || '').trim();
        const structured = [theme ? `【${theme}】` : '', title ? `《${title}》` : '']
            .filter(Boolean)
            .join(' ');
        if (structured) return structured;

        const toPlainText = typeof getPlainText === 'function' ? getPlainText : value => String(value || '');
        const firstLine = normalizeText(toPlainText(post?.caption || '')).split('\n')[0] || '';
        return firstLine || '（未命名貼文）';
    }

    function formatRangeLabel(startDate, endDate) {
        const start = parseDate(startDate);
        const end = parseDate(endDate);
        if (!start || !end) return '';
        return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日－${end.getMonth() + 1} 月 ${end.getDate()} 日`;
    }

    function buildWeek(database, anchorDate, options = {}) {
        const safeDatabase = database && typeof database === 'object' ? database : {};
        const startDate = getWeekStart(anchorDate);
        const days = WEEKDAY_NAMES.map((weekday, index) => {
            const date = shiftDate(startDate, index);
            const posts = (Array.isArray(safeDatabase[date]) ? [...safeDatabase[date]] : [])
                .sort((a, b) => {
                    const timeOrder = String(a?.time || '00:00').localeCompare(String(b?.time || '00:00'));
                    if (timeOrder) return timeOrder;
                    return String(a?._id || '').localeCompare(String(b?._id || ''));
                });
            return {
                weekday,
                date,
                posts,
                lines: posts.map(post => formatPostLine(post, options.getPlainText))
            };
        });
        const endDate = days[6].date;
        const text = days.map(day => [
            day.weekday,
            ...(day.lines.length ? day.lines : ['（無貼文）'])
        ].join('\n')).join('\n\n');

        return {
            startDate,
            endDate,
            rangeLabel: formatRangeLabel(startDate, endDate),
            filename: `排版桌_週貼文_${startDate}_至_${endDate}.txt`,
            postCount: days.reduce((sum, day) => sum + day.posts.length, 0),
            days,
            text
        };
    }

    const api = Object.freeze({
        WEEKDAY_NAMES,
        parseDate,
        formatDate,
        shiftDate,
        getWeekStart,
        formatPostLine,
        formatRangeLabel,
        buildWeek
    });
    global.WeeklyExportService = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
