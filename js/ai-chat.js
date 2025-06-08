document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const leadForm = document.getElementById('leadForm');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const projectIdeaInput = document.getElementById('projectIdea');
    const submitLeadInfoBtn = document.getElementById('submitLeadInfoBtn');

    const PHP_AI_ENDPOINT = 'server/ai_request.php';
    const PHP_PROCESS_CLIENT_ENDPOINT = 'server/process_client.php';

    const LOCAL_STORAGE_KEY = 'AIChat';
    const CONVERSATION_ENDED_KEY = 'AIChatEnded';

    let conversationHistory = [];
    let conversationEnded = false;

    function loadConversation() {
        const storedConversation = localStorage.getItem(LOCAL_STORAGE_KEY);
        const storedEndedState = localStorage.getItem(CONVERSATION_ENDED_KEY);

        if (storedConversation) {
            conversationHistory = JSON.parse(storedConversation);
            chatMessagesContainer.innerHTML = '';
            conversationHistory.forEach(msg => {
                 addMessageToUI(msg.parts[0].text, msg.role === 'user' ? 'user' : 'ai');
            });
            if (conversationHistory.length === 0) {
                addInitialAIMessage();
            }
        } else {
            addInitialAIMessage();
        }

        if (storedEndedState === 'true') {
            conversationEnded = true;
            const lastMessageText = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length-1].parts[0].text : "Conversation ended.";
            disableChatInput(isThankYouResponse(lastMessageText) ? null : "Thank you! We'll be in touch.");
        }
        sendChatBtn.disabled = chatInput.value.trim() === '' || conversationEnded;
    }

    function saveConversation() {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(conversationHistory));
        localStorage.setItem(CONVERSATION_ENDED_KEY, conversationEnded.toString());
    }

    function addInitialAIMessage() {
        const initialAIResponse = "Hi, I'm Yassine Jalti's AI consultant. What project are you thinking about?";
        addMessageToUI(initialAIResponse, "ai");
        if (conversationHistory.length === 0) {
            conversationHistory.push({ role: "model", parts: [{ text: initialAIResponse }] });
        }
    }

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        sendChatBtn.disabled = chatInput.value.trim() === '' || conversationEnded;
    });

    sendChatBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !sendChatBtn.disabled) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = fullNameInput.value.trim();
        const emailValue = emailInput.value.trim();
        const idea = projectIdeaInput.value.trim();

        if (name && emailValue && idea) {
            const clientDataFromForm = {
                status: "information_collected",
                fullName: name,
                email: emailValue,
                projectIdea: idea
            };

            const formUserMsg = `Provided details via form:\nName: ${name}\nEmail: ${emailValue}\nProject Idea: ${idea}`;
            addMessageToUI(formUserMsg, 'user');
            conversationHistory.push({ role: 'user', parts: [{ text: formUserMsg }] });

            handleInformationCollected(clientDataFromForm);

        } else {
            addMessageToUI("Please fill out all fields in the form to submit your project details.", "ai", false, true);
        }
    });

     submitLeadInfoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        leadForm.requestSubmit();
    });

    async function handleSendMessage() {
        if (conversationEnded) return;

        const messageText = chatInput.value.trim();
        if (messageText === '') return;

        addMessageToUI(messageText, 'user');
        conversationHistory.push({ role: 'user', parts: [{ text: messageText }] });

        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendChatBtn.disabled = true;

        const loadingMessageElement = addMessageToUI("Consulting", "ai", true);

        try {
            const serverResponse = await sendMessageToAIProxy(conversationHistory);
            loadingMessageElement.remove();

            if (serverResponse.clientData && serverResponse.clientData.status === "information_collected") {
                handleInformationCollected(serverResponse.clientData);
            } else if (serverResponse.aiResponse) {
                addMessageToUI(serverResponse.aiResponse, 'ai');
                conversationHistory.push({ role: 'model', parts: [{ text: serverResponse.aiResponse }] });
                if (serverResponse.aiResponse.toLowerCase().includes("our team will contact you shortly")) {
                    conversationEnded = true;
                    disableChatInput();
                }
            } else {
                throw new Error("Unexpected response format from server after AI call.");
            }

        } catch (error) {
            loadingMessageElement.remove();
            addMessageToUI(`Error: ${error.message}`, 'ai', false, true);
        } finally {
            saveConversation();
            if (!conversationEnded) {
                sendChatBtn.disabled = chatInput.value.trim() === '';
            }
        }
    }

    async function handleInformationCollected(collectedData) {
        const finalThankYouMessage = "Thank you for sharing your details and project idea! Yassine Jalti or his team will be in touch with you soon to discuss it further. We appreciate your interest!";

        addMessageToUI(finalThankYouMessage, "ai", false, false, true);
        conversationHistory.push({ role: 'model', parts: [{ text: finalThankYouMessage }] });

        conversationEnded = true;
        disableChatInput();
        saveConversation();

        await sendClientInfoToBackend({
            fullName: collectedData.fullName,
            email: collectedData.email,
            projectIdea: collectedData.projectIdea
        });
    }
    
    function isThankYouResponse(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        return lowerText.includes("thank you for sharing your details") ||
               lowerText.includes("yassine jalti or his team will be in touch") ||
               lowerText.includes("our team will contact you shortly regarding your inquiry");
    }

    async function sendClientInfoToBackend(dataToSend) {
        if (!dataToSend.fullName || !dataToSend.email || !dataToSend.projectIdea) {
        }

        try {
            const response = await fetch(PHP_PROCESS_CLIENT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                let errorMsg = `Error sending client data: ${response.status}`;
                try { const errData = await response.json(); errorMsg += ` - ${errData.message || 'Server error'}`; } catch (e) { }
                addMessageToUI("Note: There was a technical issue submitting your details automatically. Please rest assured, Yassine will review our chat.", "ai", false, true);
                return;
            }

            const result = await response.json();
            if (result.success) {
            } else {
                addMessageToUI(`Note: Submission confirmation issue (Ref: ${result.message || 'Unknown'}). Yassine will review our chat.`, "ai", false, true);
            }
        } catch (error) {
            addMessageToUI("Note: Connection issue during submission. Yassine will review our chat logs.", "ai", false, true);
        }
    }

    function addMessageToUI(text, sender, isLoading = false, isError = false, isFinalMessage = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
        if (isFinalMessage || (sender === 'ai' && isThankYouResponse(text))) {
            messageDiv.classList.add('final-message');
        }

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('message-avatar', sender === 'user' ? 'user-avatar' : 'ai-avatar');

        if (sender === 'user') {
            avatarDiv.innerHTML = `<img src="img/user.webp" alt="USER" width="22px" height="22px">`;
        } else {
            avatarDiv.innerHTML = `<img src="img/ai.webp" alt="AI" width="22px" height="22px">`;
        }
        messageDiv.appendChild(avatarDiv);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        if (isLoading) {
            contentDiv.classList.add('loading-message');
        }
        if (isError) {
            contentDiv.style.backgroundColor = 'rgba(255, 50, 50, 0.3)';
            contentDiv.style.borderColor = 'rgba(255, 50, 50, 0.7)';
        }

        const p = document.createElement('p');
        p.textContent = text;
        contentDiv.appendChild(p);
        messageDiv.appendChild(contentDiv);

        chatMessagesContainer.appendChild(messageDiv);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        return messageDiv;
    }

    async function sendMessageToAIProxy(currentConversationForPHP) {
        try {
            const response = await fetch(PHP_AI_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ conversationHistory: currentConversationForPHP }),
            });

            if (!response.ok) {
                let errorMessage = `AI Server error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage += ` - ${errorData.error}`;
                        if (errorData.details) { errorMessage += ` (Details: ${errorData.details})`; }
                    }
                } catch (e) {
                    const textError = await response.text();
                    errorMessage += ` - ${textError || 'Unknown AI server error'}`;
                }
                throw new Error(errorMessage);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            throw error;
        }
    }

    function disableChatInput(finalMessageText = null) {
        chatInput.value = finalMessageText || "This conversation has concluded. Thank you for your interest!";
        chatInput.disabled = true;
        sendChatBtn.disabled = true;
        chatInput.style.cursor = "not-allowed";
        sendChatBtn.style.cursor = "not-allowed";
        submitLeadInfoBtn.disabled = true;
        submitLeadInfoBtn.style.opacity = "0.5";
        submitLeadInfoBtn.style.cursor = "not-allowed";
        fullNameInput.disabled = true;
        emailInput.disabled = true;
        projectIdeaInput.disabled = true;
    }

    loadConversation();
});
