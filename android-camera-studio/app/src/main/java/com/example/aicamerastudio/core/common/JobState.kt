package com.example.aicamerastudio.core.common

/** Lifecycle of an enhancement or export job. Terminal states never change. */
enum class JobState {
    QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED;

    val isTerminal: Boolean get() = this == SUCCEEDED || this == FAILED || this == CANCELLED

    fun canMoveTo(next: JobState): Boolean = when (this) {
        QUEUED -> next == RUNNING || next == CANCELLED || next == FAILED
        RUNNING -> next == SUCCEEDED || next == FAILED || next == CANCELLED || next == QUEUED // QUEUED: interrupted, will retry
        SUCCEEDED, FAILED, CANCELLED -> next == QUEUED && this != SUCCEEDED // retry of failed or cancelled work
    }

    fun moveTo(next: JobState): JobState {
        require(canMoveTo(next)) { "Illegal job transition $this -> $next" }
        return next
    }
}
