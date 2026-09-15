const display = document.getElementById("display");
const startBtn = document.getElementById("startbtn");
const pauseBtn = document.getElementById("pausebtn");
const resetBtn = document.getElementById("resetbtn");

let startTime = 0;
let elapsedTime = 0;
let timerInterval = null;

function formatTime(milliseconds) {
    let totalSeconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let centiseconds = Math.floor((milliseconds % 1000) / 10);

    minutes = minutes.toString().padStart(2, '0');
    seconds = seconds.toString().padStart(2, '0');
    centiseconds = centiseconds.toString().padStart(2, '0');

    return `${minutes}:${seconds}:${centiseconds}`;
}

startBtn.addEventListener("click", function() {
    if (timerInterval !== null) return; 
    startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(function() {
        elapsedTime = Date.now() - startTime;
        display.textContent = formatTime(elapsedTime);
    }, 10);
});

pauseBtn.addEventListener("click", function() { 
    clearInterval(timerInterval);
    timerInterval = null;
});

resetBtn.addEventListener("click", function() {
    clearInterval(timerInterval);
    timerInterval = null;
    elapsedTime = 0;
    display.textContent = "00:00:00";
});