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
        
    }
}