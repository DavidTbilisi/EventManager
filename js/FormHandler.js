export default class FormHandler {
    constructor() {
        this.form = document.querySelector('form');
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    handleSubmit(event) {
        event.preventDefault();
        const formData = new FormData(this.form);
        const data = {};
        for (let [key, value] of formData) {
            data[key] = value;
        }
        console.log(data);

        // Save data to local storage
        const localStorage = new LocalStorage();
        localStorage.set('formData', data);

        // Save event to cookie
        let events = [];
        const cookie = document.cookie.split('; ').find(row => row.startsWith('events='));
        if (cookie) {
            try {
                events = JSON.parse(decodeURIComponent(cookie.split('=')[1]));
            } catch (e) {
                events = [];
            }
        }
        events.push(data);
        document.cookie = `events=${encodeURIComponent(JSON.stringify(events))}; path=/; max-age=31536000`;
    }
}