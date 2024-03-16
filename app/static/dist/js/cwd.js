let controller = new AbortController();
let signal = controller.signal;
function getCsrfToken() {
  return document
    .querySelector('meta[name="csrf-token"]')
    .getAttribute("content");
}
function showToast(message, type) {
  let toast = document.getElementById("toast") || createToastElement();
  toast.textContent = message;
  toast.className = type;
  showAndHideToast(toast);
}
function createToastElement() {
  const toast = document.createElement("div");
  toast.id = "toast";
  document.body.appendChild(toast);
  return toast;
}
function showAndHideToast(toast) {
  Object.assign(toast.style, { display: "block", opacity: "1" });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 600);
  }, 3000);
}
document.addEventListener("DOMContentLoaded", function () {
  const queryInput = document.getElementById("query");
  queryInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      queryDocument();
    }
  });
});
function setupFormSubmission(
  formId,
  submitUrl,
  successCallback,
  errorCallback,
) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    submitForm(formData, submitUrl).then(successCallback).catch(errorCallback);
  });
}
async function submitForm(formData, submitUrl) {
  const response = await fetch(submitUrl, {
    method: "POST",
    headers: { "X-CSRFToken": getCsrfToken() },
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Failed to update preferences.");
  }
  return response.json();
}
function handleResponse(data) {
  if (data.status === "success") {
    showToast(data.message, "success");
  } else {
    showToast(data.message, "error");
    console.error(data.errors);
  }
}
setupFormSubmission(
  "docs-preferences-form",
  "/embedding/update-doc-preferences",
  handleResponse,
  (error) => showToast("Error: " + error.message, "error"),
);
let previousQuery = null;
let previousResponse = null;
function addToQueryHistory(query, response) {
  const queryResultsSection = document.getElementById("query-results-section");
  const currentQueryResponse = document.getElementById("current-query");
  const historyEntry = document.createElement("div");
  historyEntry.className = "history-entry";
  historyEntry.innerHTML = `<strong>Query:</strong><pre>${query}</pre><br><br><strong>Response:</strong><pre>${response}</pre><hr class="history-delimiter"><!--This is the delimiter-->`;
  queryResultsSection.insertBefore(historyEntry, currentQueryResponse);
  document.getElementById("user_query").textContent = "";
  document.getElementById("results").textContent = "";
  document.getElementById("user_query").parentNode.style.display = "none";
  document.getElementById("response_container").style.display = "none";
}
async function queryDocument() {
  document.getElementById("interruptButton").disabled = false;
  const query = document.getElementById("query").value.trim();
  if (query === "") {
    showToast("Query cannot be empty.", "warning");
    return;
  }
  const userQueryElement = document.getElementById("user_query");
  userQueryElement.parentNode.style.display = "block";
  userQueryElement.textContent = query;
  document.getElementById("query").value = "";
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "<pre></pre>";
  previousQuery = query;
  previousResponse = "";
  try {
    const response = await fetch("/cwd/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": getCsrfToken(),
      },
      body: `query=${encodeURIComponent(query)}`,
      signal: signal,
    });
    if (response.ok) {
      const reader = response.body.getReader();
      let decoder = new TextDecoder();
      const responseLabelContainer =
        document.getElementById("response_container");
      const resultsSpan = document.getElementById("results");
      responseLabelContainer.style.display = "block";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        resultsSpan.textContent += decoder.decode(value);
        previousResponse += decoder.decode(value);
      }
      document.getElementById("results").textContent = previousResponse;
      addToQueryHistory(previousQuery, previousResponse);
      previousResponse = "";
    } else {
      showToast("Error occurred while querying.", "error");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      showToast("Interrupted!", "warning");
    } else {
      showToast("Error occurred while querying.", "error");
    }
  }
}
function interruptQuery() {
  controller.abort();
  controller = new AbortController();
  signal = controller.signal;
  const resultsSpan = document.getElementById("results");
  if (resultsSpan.lastChild) {
    resultsSpan.removeChild(resultsSpan.lastChild);
  }
  document.getElementById("interruptButton").disabled = true;
  document.getElementById("queryButton").disabled = false;
}
