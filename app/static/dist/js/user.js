function getCsrfToken() {
  return document
    .querySelector('meta[name="csrf-token"]')
    .getAttribute("content");
}
function showToast(message, type) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = type;
  toast.style.display = "block";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 600);
  }, 3000);
}
document
  .getElementById("api-key-form")
  .addEventListener("submit", function (e) {
    e.preventDefault();
    var apiKeyInput = document.getElementById("api_key");
    var nicknameInput = document.getElementById("nickname");
    var apiKeysString = apiKeyInput.value;
    var nickname = nicknameInput.value;
    var apiKeys = findOpenAIKeys(apiKeysString);
    apiKeys.forEach((apiKey, index) => {
      var formData = new FormData();
      formData.append("api_key", apiKey);
      formData.append("nickname", nickname + " " + (index + 1));
      fetch("/user/upload_api_key", {
        method: "POST",
        headers: {
          "X-CSRFToken": getCsrfToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          nickname: nickname + " " + (index + 1),
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          showToast(
            data.message,
            data.status === "success" ? "success" : "error",
          );
        })
        .catch((error) => {
          showToast("Error: " + error, "error");
        });
    });
    apiKeyInput.value = "";
    nicknameInput.value = "";
  });
document.querySelectorAll(".retest-api-key-form").forEach((form) => {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var refreshButton = form.querySelector(".retest-key-button i.fa-sync-alt");
    if (refreshButton) {
      refreshButton.classList.add("spinning");
    }
    var formData = new FormData(form);
    var actionUrl = form.action;
    fetch(actionUrl, {
      method: "POST",
      headers: { "X-CSRFToken": getCsrfToken() },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "success") {
          showToast(data.message, "success");
        } else {
          showToast(data.message, "error");
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("An error occurred while processing your request.", "error");
      })
      .finally(() => {
        if (refreshButton) {
          refreshButton.classList.remove("spinning");
        }
      });
  });
});
function updateSelectedKeyVisual(selectedForm) {
  document.querySelectorAll(".key-list").forEach((keyItem) => {
    keyItem.classList.remove("selected-key");
  });
  const keyListItem = selectedForm.closest(".key-list");
  if (keyListItem) {
    keyListItem.classList.add("selected-key");
  }
}
function removeKeyFromUI(form) {
  const keyListItem = form.closest(".key-list");
  if (keyListItem) {
    keyListItem.remove();
  }
}
document
  .querySelectorAll(".delete-api-key-form, .select-api-key-form")
  .forEach((form) => {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(this);
      const actionUrl = form.action;
      const isSelectForm = form.classList.contains("select-api-key-form");
      fetch(actionUrl, {
        method: "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status === "success") {
            showToast(data.message, "success");
            if (isSelectForm) {
              updateSelectedKeyVisual(form);
            } else {
              removeKeyFromUI(form);
            }
          } else {
            showToast(data.message, "error");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          showToast(
            "An error occurred while processing your request.",
            "error",
          );
        });
    });
  });
function enableEditing(editButton) {
  var listItem = editButton.closest("li");
  var form = listItem.querySelector("form.edit-document-form");
  var inputs = form.querySelectorAll(".editable");
  inputs.forEach(function (input) {
    input.removeAttribute("readonly");
  });
  inputs[0].focus();
  editButton.style.display = "none";
  var saveButton = listItem.querySelector(".save-btn");
  saveButton.style.display = "inline-block";
  inputs.forEach(function (input) {
    input.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        saveButton.click();
      }
    });
  });
}
const saveButtons = document.querySelectorAll(".save-btn");
saveButtons.forEach(function (saveButton) {
  saveButton.addEventListener("click", function (event) {
    var listItem = saveButton.closest("li");
    var form = listItem.querySelector("form.edit-document-form");
    if (form) {
      event.preventDefault();
      var formData = new FormData(form);
      fetch(form.action, {
        method: "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: formData,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Server returned an error response");
          }
          return response.json();
        })
        .then((data) => {
          if (data.error) {
            alert("Error updating document: " + data.error);
          } else {
            showToast("Updated successfully!", "success");
            saveButton.style.display = "none";
            listItem.querySelector(".edit-btn").style.display = "inline-block";
            Array.from(listItem.querySelectorAll(".editable")).forEach(
              (input) => {
                input.setAttribute("readonly", "readonly");
              },
            );
          }
        })
        .catch((error) => {
          alert("An error occurred: " + error);
          showToast("Error updating document: " + error.message, "error");
        });
    }
  });
});
document.addEventListener("click", function (event) {
  if (
    event.target.classList.contains("delete-btn") ||
    event.target.closest(".delete-btn")
  ) {
    var deleteButton = event.target.classList.contains("delete-btn")
      ? event.target
      : event.target.closest(".delete-btn");
    var documentId = deleteButton.dataset.docId;
    if (confirm("Are you sure you want to delete this document?")) {
      fetch(`/embedding/delete/${documentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ document_id: documentId }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Server returned an error response");
          }
          return response.json();
        })
        .then((data) => {
          if (data.error) {
            alert("Error deleting document: " + data.error);
          } else {
            showToast("Document deleted successfully!", "success");
            var listItem = deleteButton.closest("li");
            if (listItem) {
              listItem.remove();
            }
          }
        })
        .catch((error) => {
          alert("An error occurred: " + error);
          showToast("Error deleting document: " + error.message, "error");
        });
    }
  }
});
const thumbnails = document.querySelectorAll(".image-history-item img");
thumbnails.forEach((thumbnail) => {
  thumbnail.addEventListener("click", function () {
    const imageId = this.getAttribute("data-id");
    toggleIcons(imageId, this);
  });
});
function toggleIcons(id, imageElement) {
  const imageItem = imageElement.closest(".image-history-item");
  const iconsContainer = imageItem.querySelector(".icons-container");
  if (iconsContainer && iconsContainer.hasChildNodes()) {
    iconsContainer.style.display =
      iconsContainer.style.display === "none" ? "block" : "none";
  } else {
    addIconsToImage(id, iconsContainer);
  }
}
function findOpenAIKeys(inputString) {
  const apiKeyPattern = /sk-[A-Za-z0-9]{48}/g;
  const apiKeys = inputString.match(apiKeyPattern) || [];
  return [...new Set(apiKeys)];
}
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
function submitForm(formData, submitUrl) {
  return fetch(submitUrl, {
    method: "POST",
    headers: { "X-CSRFToken": getCsrfToken() },
    body: formData,
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Failed to update preferences.");
    }
    return response.json();
  });
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
  "update-preferences-form",
  "/chat/update-preferences",
  handleResponse,
  (error) => showToast("Error: " + error.message, "error"),
);
setupFormSubmission(
  "docs-preferences-form",
  "/embedding/update-doc-preferences",
  handleResponse,
  (error) => showToast("Error: " + error.message, "error"),
);
function addIconsToImage(id, container) {
  const userId = document
    .getElementById("full-container")
    .getAttribute("data-user-id");
  if (container) {
    container.innerHTML = "";
    var downloadLink = document.createElement("a");
    downloadLink.href = `/image/download_image/${id}`;
    downloadLink.innerHTML = '<i class="fas fa-download"></i>';
    downloadLink.className = "image-icon download-icon";
    container.appendChild(downloadLink);
    var openLink = document.createElement("a");
    openLink.href = `/image/user_images/${userId}/${id}.webp`;
    openLink.target = "_blank";
    openLink.innerHTML = '<i class="fas fa-external-link-alt"></i>';
    openLink.className = "image-icon open-icon";
    container.appendChild(openLink);
    var deleteLink = document.createElement("a");
    deleteLink.href = "#";
    deleteLink.innerHTML = '<i class="fas fa-trash"></i>';
    deleteLink.className = "image-icon delete-icon";
    deleteLink.addEventListener("click", function (event) {
      event.preventDefault();
      markImageAsDeleted(id);
    });
    container.appendChild(deleteLink);
  }
  container.style.display = "block";
}
function markImageAsDeleted(imageId) {
  fetch(`/image/mark_delete/${imageId}`, {
    method: "POST",
    headers: {
      "X-CSRFToken": getCsrfToken(),
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ delete: true }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      if (data.status === "success") {
        showToast("Image marked for deletion", "success");
        const imageHistoryItemToRemove = document
          .querySelector(`.image-history-item img[data-id="${imageId}"]`)
          ?.closest(".image-history-item");
        if (imageHistoryItemToRemove) {
          imageHistoryItemToRemove.remove();
        }
      } else {
        showToast("Failed to mark image for deletion", "error");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      showToast("Error: " + error.message, "error");
    });
}
function toggleUsageInfo(usageInfoId) {
  var usageInfoDiv = document.getElementById(usageInfoId);
  if (usageInfoDiv.style.display === "none") {
    usageInfoDiv.style.display = "block";
  } else {
    usageInfoDiv.style.display = "none";
  }
}
document.querySelectorAll(".edit-btn").forEach(function (editBtn) {
  editBtn.addEventListener("click", function () {
    enableEditing(editBtn);
  });
});
document
  .querySelectorAll(".view-usage-button")
  .forEach(function (viewUsageBtn) {
    viewUsageBtn.addEventListener("click", function () {
      var usageInfoId = viewUsageBtn.getAttribute("usage-div-id");
      toggleUsageInfo(usageInfoId);
    });
  });
function toggleKeySection(activeButtonId) {
  const sections = { "keyslist-btn": "key-list", "keyedits-btn": "key-edits" };
  Object.keys(sections).forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    const section = document.getElementById(sections[buttonId]);
    if (buttonId === activeButtonId) {
      button.classList.add("active");
      section.style.display = "block";
    } else {
      button.classList.remove("active");
      section.style.display = "none";
    }
  });
}
document.getElementById("keyslist-btn").addEventListener("click", function () {
  toggleKeySection("keyslist-btn");
});
document.getElementById("keyedits-btn").addEventListener("click", function () {
  toggleKeySection("keyedits-btn");
});
toggleKeySection("keyslist-btn");
function toggleProfileSection(activeButtonId) {
  const sections = {
    "userinfo-btn": "user-info",
    "userchange-btn": "user-change",
  };
  Object.keys(sections).forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    const section = document.getElementById(sections[buttonId]);
    if (buttonId === activeButtonId) {
      button.classList.add("active");
      section.style.display = "block";
    } else {
      button.classList.remove("active");
      section.style.display = "none";
    }
  });
}
document.getElementById("userinfo-btn").addEventListener("click", function () {
  toggleProfileSection("userinfo-btn");
});
document
  .getElementById("userchange-btn")
  .addEventListener("click", function () {
    toggleProfileSection("userchange-btn");
  });
toggleProfileSection("userinfo-btn");
document
  .getElementById("username-change-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();
    var formData = new FormData(this);
    fetch("/user/change_username", {
      method: "POST",
      headers: { "X-CSRFToken": getCsrfToken() },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        showToast(
          data.message,
          data.status === "success" ? "success" : "error",
        );
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("An error occurred while processing your request.", "error");
      });
  });
function toggleUtilitySection(activeButtonId) {
  const sections = {
    "show-preferences-btn": "preference-popup",
    "docs-edit-btn": "docs-edit-popup",
    "docs-preferences-btn": "docs-settings-popup",
  };
  Object.keys(sections).forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    const section = document.getElementById(sections[buttonId]);
    if (buttonId === activeButtonId) {
      button.classList.add("active");
      section.style.display = "block";
    } else {
      button.classList.remove("active");
      section.style.display = "none";
    }
  });
}
document
  .getElementById("show-preferences-btn")
  .addEventListener("click", function () {
    toggleUtilitySection("show-preferences-btn");
  });
document.getElementById("docs-edit-btn").addEventListener("click", function () {
  toggleUtilitySection("docs-edit-btn");
});
document
  .getElementById("docs-preferences-btn")
  .addEventListener("click", function () {
    toggleUtilitySection("docs-preferences-btn");
  });
toggleUtilitySection("show-preferences-btn");
