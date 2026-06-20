(function initializeDatabase() {
  const config = window.A_DUE_CONFIG;

  if (!config || !window.supabase) {
    window.ADueDb = null;
    return;
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey
  );

  window.ADueDb = {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    onAuthChange(callback) {
      return client.auth.onAuthStateChange((_event, session) => callback(session));
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    async loadProfile(defaults) {
      const { data: existing, error: selectError } = await client
        .from("profiles")
        .select("*")
        .maybeSingle();

      if (selectError) throw selectError;
      if (existing) return existing;

      const { data: created, error: insertError } = await client
        .from("profiles")
        .insert({
          cycle_length: defaults.cycleLength,
          period_length: defaults.periodLength
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return created;
    },

    async loadCycleEvents(profileId) {
      const { data, error } = await client
        .from("cycle_events")
        .select("start_date,end_date,notes")
        .eq("profile_id", profileId)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },

    async loadObservation(profileId, observationDate) {
      const { data, error } = await client
        .from("daily_observations")
        .select("observation_date,mood,libido,energy,irritability,pain,notes")
        .eq("profile_id", profileId)
        .eq("observation_date", observationDate)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async loadAllObservations(profileId) {
      const { data, error } = await client
        .from("daily_observations")
        .select("observation_date,mood,libido,energy,irritability,pain,notes")
        .eq("profile_id", profileId)
        .order("observation_date", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data ?? [];
    },

    async loadTimelineEvents(profileId) {
      const { data, error } = await client
        .from("timeline_events")
        .select("event_date,category,intensity,details")
        .eq("profile_id", profileId)
        .order("event_date", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data ?? [];
    },

    async saveObservation(profileId, observation) {
      const { data, error } = await client
        .from("daily_observations")
        .upsert(
          {
            profile_id: profileId,
            observation_date: observation.date,
            mood: observation.mood,
            libido: observation.libido,
            energy: observation.energy,
            irritability: observation.irritability,
            pain: observation.pain,
            notes: observation.notes,
            source: "manual"
          },
          { onConflict: "profile_id,observation_date" }
        )
        .select("observation_date,mood,libido,energy,irritability,pain,notes")
        .single();

      if (error) throw error;
      return data;
    },

    async saveSettings(profileId, cycleLength, periodLength) {
      const { error } = await client
        .from("profiles")
        .update({ cycle_length: cycleLength, period_length: periodLength })
        .eq("id", profileId);

      if (error) throw error;
    },

    async saveCycleStart(profileId, startDate) {
      const { error } = await client
        .from("cycle_events")
        .upsert(
          { profile_id: profileId, start_date: startDate },
          { onConflict: "profile_id,start_date" }
        );

      if (error) throw error;
    },

    async deleteCycleStart(profileId, startDate) {
      const { error } = await client
        .from("cycle_events")
        .delete()
        .eq("profile_id", profileId)
        .eq("start_date", startDate);

      if (error) throw error;
    },

    async saveTimelineEvent(profileId, event) {
      const { data, error } = await client
        .from("timeline_events")
        .upsert(
          {
            profile_id: profileId,
            event_date: event.date,
            category: event.category,
            intensity: event.intensity,
            details: event.details
          },
          { onConflict: "profile_id,event_date,category" }
        )
        .select("event_date,category,intensity,details")
        .single();

      if (error) throw error;
      return data;
    },

    async deleteTimelineEvent(profileId, eventDate, category) {
      const { error } = await client
        .from("timeline_events")
        .delete()
        .eq("profile_id", profileId)
        .eq("event_date", eventDate)
        .eq("category", category);

      if (error) throw error;
    },

    async importHistory(profileId, cycleStarts, observations) {
      if (cycleStarts.length > 0) {
        const { error } = await client
          .from("cycle_events")
          .upsert(
            cycleStarts.map((startDate) => ({ profile_id: profileId, start_date: startDate })),
            { onConflict: "profile_id,start_date" }
          );
        if (error) throw error;
      }

      if (observations.length > 0) {
        const { error } = await client
          .from("daily_observations")
          .upsert(
            observations.map((item) => ({
              profile_id: profileId,
              observation_date: item.date,
              mood: item.mood,
              libido: item.libido,
              energy: item.energy,
              irritability: item.irritability,
              pain: item.pain,
              notes: item.notes,
              source: "import"
            })),
            { onConflict: "profile_id,observation_date" }
          );
        if (error) throw error;
      }
    },

    async clearProfileData(profileId, defaults) {
      const timeline = await client
        .from("timeline_events")
        .delete()
        .eq("profile_id", profileId);
      if (timeline.error) throw timeline.error;

      const observations = await client
        .from("daily_observations")
        .delete()
        .eq("profile_id", profileId);
      if (observations.error) throw observations.error;

      const events = await client
        .from("cycle_events")
        .delete()
        .eq("profile_id", profileId);
      if (events.error) throw events.error;

      await this.saveSettings(profileId, defaults.cycleLength, defaults.periodLength);
    }
  };
})();
