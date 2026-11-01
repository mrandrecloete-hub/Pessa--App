package com.example.aicamerastudio.core.design

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.core.errors.AppError

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppToolbar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            if (onBack != null) IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
        },
        actions = actions,
    )
}

@Composable
fun AppButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, primary: Boolean = true) {
    if (primary) Button(onClick, modifier.heightIn(min = Tokens.minTouch), enabled = enabled) { Text(text) }
    else OutlinedButton(onClick, modifier.heightIn(min = Tokens.minTouch), enabled = enabled) { Text(text) }
}

@Composable
fun LabeledSlider(
    label: String, value: Float, range: ClosedFloatingPointRange<Float>, valueText: String,
    onChange: (Float) -> Unit, onChangeFinished: () -> Unit = {}, modifier: Modifier = Modifier,
) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(valueText, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = value, onValueChange = onChange, valueRange = range, onValueChangeFinished = onChangeFinished,
            modifier = Modifier.semantics { contentDescription = "$label $valueText" },
        )
    }
}

@Composable
fun LoadingIndicator(message: String? = null, progress: Float? = null, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        if (progress != null) LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        else CircularProgressIndicator()
        if (message != null) Text(message, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxSize().padding(Tokens.spaceLg).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Tokens.spaceSm))
        Text(body, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (action != null) { Spacer(Modifier.height(Tokens.spaceMd)); action() }
    }
}

@Composable
fun ErrorCard(error: AppError, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null, onDismiss: (() -> Unit)? = null) {
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Row(Modifier.padding(Tokens.spaceMd), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            Icon(Icons.Default.ErrorOutline, contentDescription = "Error")
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                Text(error.asMessage(), style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    if (onRetry != null && error.retryable) TextButton(onRetry) { Text("Try again") }
                    if (onDismiss != null) TextButton(onDismiss) { Text("Dismiss") }
                }
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirmLabel: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(text) },
        confirmButton = { TextButton(onConfirm) { Text(confirmLabel) } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}
