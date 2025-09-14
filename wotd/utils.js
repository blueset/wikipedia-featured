export function processDescriptions(cheerioElement, $) {
    // Clone the element to avoid modifying the original
    cheerioElement = cheerioElement.clone();
    
    // Remove <a> tags but keep their text content
    cheerioElement.find('a').each((i, el) => {
        $(el).replaceWith(el.children);
    });
    
    // Replace span.ib-content with em tags
    cheerioElement.find('span.ib-content').map((i, el) => {
        el.tagName = 'em';
        return $(el);
    });

    return cheerioElement.html().trim() || '';
}

export function enParseDate(year, month, day) {
    const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    
    const monthNum = months[month];
    const dayPadded = day.padStart(2, '0');
    
    return `${year}-${monthNum}-${dayPadded}`;
}

// Helper function to calculate the first day of a given week in the current year
export function getFirstDayOfWeek(weekNumber) {
    const currentYear = new Date().getFullYear();
    const jan1 = new Date(currentYear, 0, 1);
    const daysToFirstMonday = (8 - jan1.getDay()) % 7;
    const firstMonday = new Date(currentYear, 0, 1 + daysToFirstMonday);
    const targetWeek = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
    return targetWeek.toISOString().split('T')[0];
}

// Helper function to filter out empty strings from an array
export function filterEmptyStrings(array) {
    return array.filter(item => item && item.trim() !== '');
}