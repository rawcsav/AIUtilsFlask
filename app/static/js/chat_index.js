let isUploading = false;
let controller = new AbortController();
let signal = controller.signal;

$(document).ready(function () {
  checkAPIKeyStatus();

  // Get the modal and close button
  var instructionsModal = $('#instructionsModal');
  var apiKeyModal = $('#apiKeyModal'); // The new modal for the API Key
  var closeBtn = $('.close');

  // Function to show a modal and prevent background scrolling
  function showModal(modal) {
    modal.css('display', 'block');
    $('body').css('overflow', 'hidden');
  }

  // Function to hide a modal and allow background scrolling
  function hideModal(modal) {
    modal.css('display', 'none');
    $('body').css('overflow', 'auto');
  }

  // Show the instructions modal when the button is clicked
  $('#showInstructions').click(function () {
    showModal(instructionsModal);
  });

  // Show the API Key modal when the button is clicked
  $('#showApiKey').click(function () {
    showModal(apiKeyModal);
  });

  // Hide the modal when the close button (×) is clicked
  closeBtn.click(function () {
    hideModal(instructionsModal);
    hideModal(apiKeyModal);
  });

  // Hide the modal when the user clicks outside of it
  $(window).click(function (event) {
    if ($(event.target).is(instructionsModal)) {
      hideModal(instructionsModal);
    }
    if ($(event.target).is(apiKeyModal)) {
      hideModal(apiKeyModal);
    }
  });
});

// Get the input element

document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('fileInput');

  fileInput.addEventListener('change', function () {
    uploadDocuments();
  });

  const queryInput = document.getElementById('query');
  queryInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      queryDocument();
    }
  });
});

let isAPIKeySet = false;

function removeFileExtension(filename) {
  return filename.substring(0, filename.lastIndexOf('.'));
}

async function uploadDocuments() {
  showAlert('Uploading...', 'info', 'upload');
  updateQueryButtonStatus(true);

  // Check if the API key is set
  if (!isAPIKeySet) {
    showAlert('Please set your OpenAI API Key first.', 'danger', 'upload');
    return;
  }

  isUploading = true;

  const formData = new FormData(document.querySelector('#uploadForm'));

  const existingFiles = [
    ...document.querySelectorAll('#uploaded_docs_list li'),
  ].map((li) => li.textContent.trim());
  for (let file of formData.getAll('file')) {
    if (existingFiles.includes(file.name)) {
      showAlert(
        `The file "${file.name}" is already uploaded. Skipping duplicate.`,
        'warning',
        'upload',
      );
      formData.delete('file'); // Remove the file from formData to prevent upload
    }
  }

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (data.status === 'success') {
      let uploadedCount = 0;
      const docList = document.getElementById('uploaded_docs_list');

      for (let msg of data.messages) {
        if (msg.includes('processed successfully')) {
          uploadedCount += 1;
          const docNameWithExtension = msg.split(' ')[1];
          const docName = docNameWithExtension.split('.')[0]; // Remove the extension

          const listItem = document.createElement('li');

          // Create and configure the delete button
          const deleteButton = document.createElement('button');
          deleteButton.className = 'delete-btn';
          deleteButton.textContent = 'X';
          deleteButton.onclick = function () {
            removeFile(docNameWithExtension);
          }; // Attach the removeFile function

          // Add the checkbox and the document name (without extension)
          listItem.innerHTML = `<input type="checkbox" name="selected_docs" value="${docNameWithExtension}" checked> ${docName}`;

          // Append the delete button to the list item
          listItem.appendChild(deleteButton);

          // Finally, append the list item to the document list
          docList.appendChild(listItem);
        }
      }

      if (uploadedCount > 0) {
        showAlert(
          `${uploadedCount} files uploaded successfully.`,
          'success',
          'upload',
        );
      } else {
        showAlert('No files uploaded successfully.', 'danger', 'upload');
      }
    } else {
      for (let msg of data.messages) {
        showAlert(msg, 'danger', 'upload');
      }
    }
  } catch (error) {
    showAlert(
      'There was an error processing your request.',
      'danger',
      'upload',
    );
  }

  // Reset the isUploading flag and update the query button's status
  isUploading = false;
  isAPIKeySet = await checkAPIKeyStatus();
  showQueryButtonIfNeeded(isAPIKeySet);
}

function updateQueryButtonStatus(isUploadingStatus = false) {
  const queryInput = document.getElementById('query');
  const queryButton = document.getElementById('queryButton');

  if (isUploadingStatus || isUploading) {
    queryInput.disabled = true;
    queryButton.disabled = true;
    queryInput.placeholder = 'Uploading...';
  } else {
    queryInput.disabled = false;
    queryButton.disabled = false;
    queryInput.placeholder = 'Enter your query here...';
  }
}

function showQueryButtonIfNeeded(apiKeySet = false) {
  const queryInput = document.getElementById('query');
  const queryButton = document.getElementById('queryButton');
  const hasUploadedFiles =
    document.querySelectorAll('#uploaded_docs_list li').length > 0;
  const shouldEnable = apiKeySet && hasUploadedFiles && !isUploading;

  queryInput.disabled = !shouldEnable;
  queryButton.disabled = !shouldEnable;
  queryInput.placeholder = shouldEnable
    ? 'Enter your query here...'
    : 'Waiting for docs...';
}

let previousQuery = null;
let previousResponse = null;

function addToQueryHistory(query, response) {
  const queryResultsSection = document.getElementById('query-results-section');
  const currentQueryResponse = document.getElementById('current-query');

  // Update the current query-response
  document.getElementById('user_query').textContent = query;
  document.getElementById('results').textContent = response;

  // If there's a previous query-response, move it to history
  if (previousQuery !== null && previousResponse !== null) {
    const historyEntry = document.createElement('div');
    historyEntry.className = 'history-entry';
    historyEntry.innerHTML = `
  <strong>Query:</strong> <pre>${previousQuery}</pre><br><br>
  <strong>Response:</strong> <pre>${previousResponse}</pre>
  <hr class="history-delimiter">  <!-- This is the delimiter -->
`;

    // Insert the history entry before the current query-response
    queryResultsSection.insertBefore(historyEntry, currentQueryResponse);
  }

  // Update previousQuery and previousResponse for the next iteration
  previousQuery = query;
  previousResponse = response;
}

async function queryDocument() {
  document.getElementById('interruptButton').disabled = false;
  const checkboxes = document.querySelectorAll(
    'input[name="selected_docs"]:checked',
  );

  if (checkboxes.length === 0) {
    // Handle no checkboxes selected
    return;
  }

  const query = document.getElementById('query').value.trim(); // Added .trim()

  if (query === '') {
    showAlertInChatbox('Query cannot be empty.', 'warning');
    return;
  }
  const userQueryElement = document.getElementById('user_query');
  userQueryElement.parentNode.style.display = 'block';
  userQueryElement.textContent = query;
  document.getElementById('query').value = '';

  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '<pre></pre>';
  const preElement = resultsDiv.querySelector('pre');
  const selectedDocs = [];
  checkboxes.forEach((checkbox) => {
    selectedDocs.push(checkbox.value);
  });

  try {
    const response = await fetch('/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `query=${encodeURIComponent(
        query,
      )}&selected_docs=${encodeURIComponent(selectedDocs.join(','))}`,
      signal: signal,
    });

    if (response.ok) {
      const reader = response.body.getReader();
      let decoder = new TextDecoder();
      const responseLabelContainer =
        document.getElementById('response_container');
      const resultsSpan = document.getElementById('results');
      responseLabelContainer.style.display = 'block';
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        resultsSpan.textContent += decoder.decode(value);
      }

      // At this point, the whole response has been read
      addToQueryHistory(query, resultsSpan.textContent); // Note the change here
    } else {
      // Handle error
      showAlertInChatbox('Error occurred while querying.', 'danger');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      showAlertInChatbox('Interrupted!', 'warning');
    } else {
      showAlertInChatbox('Error occurred while querying.', 'danger');
    }
  }
}

async function setAPIKey() {
  const apiKey = $("input[name='api_key']").val();
  const formData = new FormData();
  formData.append('api_key', apiKey);

  try {
    const response = await fetch('/set_api_key', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json(); // Parse the response body

    if (response.ok && data.status !== 'error') {
      // Check if status is not "error"
      document.getElementById('fileInput').disabled = false;
      document.querySelector('.apiKeyAlerts').innerHTML = ''; // Clear any existing alerts
      document.getElementById('apiKeyStatus').style.display = 'block';
      document.getElementById('apiKeyStatus2').style.display = 'block';

      document.getElementById('apiKeyStatus').innerHTML =
        document.getElementById('apiKeyStatus2').innerHTML =
          'API Key Set Successfully!'; // Display success status
      $('#apiKeyModal').fadeOut(); // Hide the modal

      isAPIKeySet = await checkAPIKeyStatus();
      showQueryButtonIfNeeded(isAPIKeySet);
    } else {
      // Show the error message from the server, or a generic error message
      document.getElementById('apiKeyStatus').style.display = 'none'; // Hide the success status
      document.getElementById('apiKeyStatus2').style.display = 'none'; // Hide the success status

      document.getElementById('apiKeyStatus').innerHTML = ''; // Clear any existing status
      document.getElementById('apiKeyStatus2').innerHTML = ''; // Clear any existing status

      showAlert(
        data.message || 'Error. Please check the key and try again.',
        'danger',
      );
    }
  } catch (error) {
    showAlert('Error setting the API Key.', 'danger');
  }
}

async function checkAPIKeyStatus() {
  const response = await fetch('/check_api_key');
  const data = await response.json();

  const statusDiv = $('#apiKeyStatus');
  const statusDiv2 = $('#apiKeyStatus2');

  const apiKeyModal = $('#apiKeyModal');
  const queryInput = document.getElementById('query'); // get the query input field

  if (data.status === 'set') {
    isAPIKeySet = true;
    document.getElementById('fileInput').disabled = false;
    statusDiv.text('API Key Set!');
    statusDiv2.text('API Key Set!');

    statusDiv.css('color', 'green');
    statusDiv2.css('color', 'green');

    statusDiv.show();
    statusDiv2.show();

    apiKeyModal.fadeOut(); // Hide the modal
    queryInput.disabled = false; // enable the query input field
  } else {
    document.getElementById('fileInput').disabled = true;
    statusDiv.text('No API Key.');
    statusDiv2.text('No API Key.');

    statusDiv.css('color', 'red');
    statusDiv2.css('color', 'red');

    statusDiv.show();
    statusDiv2.show();

    apiKeyModal.fadeIn(); // Show the modal
    queryInput.disabled = true; // disable the query input field
  }
  return data.status === 'set';
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', checkAPIKeyStatus);

function interruptQuery() {
  controller.abort();
  controller = new AbortController();
  signal = controller.signal;

  const resultsSpan = document.getElementById('results');
  if (resultsSpan.lastChild) {
    resultsSpan.removeChild(resultsSpan.lastChild);
  }

  document.getElementById('interruptButton').disabled = true;
  document.getElementById('queryButton').disabled = false;
}

async function removeFile(fileName) {
  try {
    const response = await fetch(
      `/remove_file?fileName=${encodeURIComponent(fileName)}`,
      {
        method: 'DELETE',
      },
    );

    if (response.ok) {
      // Log the fileName for debugging
      console.log('Attempting to remove file with name:', fileName);

      // Remove the list item from the DOM
      const listItem = document.querySelector(`[data-file-name='${fileName}']`);

      // Check if listItem exists before trying to remove it
      if (listItem) {
        listItem.remove();
      } else {
        console.warn('No listItem found with the given fileName.');
        $('#docs-alerts').html(
          '<div class="alert alert-warning">Failed to locate the file in the UI.</div>',
        );
      }
    } else {
      $('#docs-alerts').html(
        '<div class="alert alert-danger">Failed to delete the file. Please try again.</div>',
      );
    }
  } catch (err) {
    console.error('Failed to delete the file', err);
    $('#docs-alerts').html(
      '<div class="alert alert-danger">An error occurred while trying to delete the file.</div>',
    );
  }
}

function showAlert(message, type, context = 'apiKey') {
  let alertsDiv;
  switch (context) {
    case 'upload':
      alertsDiv = document.querySelector('.uploadAlerts');
      break;
    case 'query':
      alertsDiv = document.getElementById('queryAlertInsideInput');
      break;
    default:
      alertsDiv = document.querySelector('.apiKeyAlerts');
  }

  // For the alert inside the input box, we directly set the text content
  if (context === 'query') {
    alertsDiv.textContent = message;
  } else {
    // For the other alerts, we append a new div with the message
    alertsDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }
}

function showAlertInChatbox(message, type) {
  const resultsSpan = document.getElementById('results');
  const responseLabel = document.getElementById('responseLabel'); // Fetching the element by ID

  // Clear existing content
  resultsSpan.textContent = '';

  // Insert the alert message
  resultsSpan.innerHTML = `<div class="alert alert-${type}">${message}</div>`;

  // Hide the 'Response:' label
}
