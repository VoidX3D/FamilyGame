/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import crypto from "node:crypto";
import { getCollection } from "../contentStore.js";
import {
  answerMatches, award, cleanText, completeRound, control, gameState,
  playerInGame, playerName, publicBase, roomMemory, setNextRound,
  shuffle, submittedCount,
} from "./common.js";

const configs = {
  "would-you-rather": { name: "Would You Rather?", tagline: "Pick a side and see where the room lands.", collection: "wouldYouRatherQuestions", maxRounds: 5 },
  "caption-this": { name: "Caption This", tagline: "Write the funniest caption before the room votes.", collection: "captionPrompts", maxRounds: 3 },
  "emoji-guess": { name: "Emoji Guess", tagline: "Decode the emojis before everyone else.", collection: "emojiPuzzles", maxRounds: 5 },
  "two-truths-one-lie": { name: "Two Truths & One Lie", tagline: "Tell three stories. Hide one lie.", collection: "twoTruthsTopics", maxRounds: 3 },
  spyfall: { name: "Spyfall", tagline: "Find the spy before the spy finds the location.", collection: "spyfallLocations", maxRounds: 3 },
};

function safeRecord(kind, item) {
  if (kind === "would-you-rather") return { optionA: item?.optionA ?? "Stay in", optionB: item?.optionB ?? "Go out", category: item?.category ?? "Fun" };
  if (kind === "caption-this") return { text: item?.text ?? "When the family group chat goes quiet", category: item?.category ?? "Family" };
  if (kind === "emoji-guess") return { emoji: item?.emoji ?? "🌈 🐝", name: item?.name ?? "Rainbow", category: item?.category ?? "Things", aliases: item?.aliases ?? [], hints: item?.hints ?? [] };
  if (kind === "two-truths-one-lie") return { text: item?.text ?? "A surprising thing about your childhood", category: item?.category ?? "Stories" };
  return { name: item?.name ?? "Airport", category: item?.category ?? "Places", aliases: item?.aliases ?? [] };
}

export function makeSocialEngine(kind) {
  const cfg = configs[kind];
  const meta = { id: kind, name: cfg.name, tagline: cfg.tagline, minPlayers: 3, maxPlayers: 10, maxRounds: cfg.maxRounds, hasScore: true };

  function begin(game, room) {
    const [item] = pick(room);
    game.item = safeRecord(kind, item);
    game.phase = kind === "would-you-rather" ? "vote" : kind === "caption-this" ? "writing" : kind === "emoji-guess" ? "guessing" : kind === "two-truths-one-lie" ? "writing" : "reveal";
    game.votes = {};
    game.explanations = {};
    game.captions = [];
    game.guesses = {};
    game.solved = {};
    game.skipped = {};
    game.statements = {};
    game.spyId = kind === "spyfall" ? game.players[Math.floor(Math.random() * game.players.length)]?.id : null;
    game.ready = {};
    game.results = null;
    game.scored = false;
    if (kind === "spyfall") game.location = game.item;
  }

  function pick(room) {
    const list = getCollection(cfg.collection);
    const memory = roomMemory(room, cfg.collection);
    const available = list.filter((item) => !memory.includes(item.id));
    const item = (available.length ? available : list)[0] ?? {};
    if (item.id && !memory.includes(item.id)) memory.push(item.id);
    return [item];
  }

  function create(room) {
    const game = gameState(meta, room);
    game.usedIds = roomMemory(room, cfg.collection);
    begin(game, room);
    return game;
  }

  function finish(room, game) {
    if (game.scored) return;
    game.scored = true;
    if (kind === "would-you-rather") {
      const counts = { a: 0, b: 0 };
      for (const vote of Object.values(game.votes)) counts[vote] += 1;
      const majority = counts.a === counts.b ? null : counts.a > counts.b ? "a" : "b";
      for (const player of game.players) if (game.votes[player.id] && (!majority || game.votes[player.id] === majority)) award(room, player.id, 1);
      game.results = { counts, majority, explanations: Object.entries(game.explanations).filter(([, text]) => text).map(([playerId, text]) => ({ playerId, playerName: playerName(game, playerId), text })) };
    } else if (kind === "caption-this") {
      const counts = Object.fromEntries(game.captions.map((caption) => [caption.id, 0]));
      for (const id of Object.values(game.votes)) if (counts[id] !== undefined) counts[id] += 1;
      const top = Math.max(0, ...Object.values(counts));
      game.results = game.captions.map((caption) => ({ id: caption.id, text: caption.text, authorId: caption.authorId, authorName: playerName(game, caption.authorId), votes: counts[caption.id] ?? 0, bonus: top > 0 && counts[caption.id] === top ? 2 : 0 }));
      for (const row of game.results) award(room, row.authorId, row.votes + row.bonus);
    } else if (kind === "emoji-guess") {
      /* The first one to get it is worth three, the rest are worth one.
       * The points were worked out and then never handed over, so
       * nobody ever scored in this game. */
      game.results = game.players.map((player) => {
        const points = game.solved[player.id] ? (game.solved[player.id] === 1 ? 3 : 1) : 0;
        if (points > 0) award(room, player.id, points);
        return { playerId: player.id, playerName: player.name, solved: Boolean(game.solved[player.id]), points };
      });
    } else if (kind === "two-truths-one-lie") {
      const storyteller = game.players[game.round - 1] ?? game.players[0];
      const lie = game.statements[storyteller.id]?.lieIndex ?? 0;
      const correct = Object.entries(game.guesses).filter(([, index]) => Number(index) === Number(lie));
      for (const [playerId, index] of Object.entries(game.guesses)) if (Number(index) === Number(lie)) award(room, playerId, 1); else award(room, storyteller.id, 1);
      game.results = { storytellerId: storyteller.id, storytellerName: storyteller.name, lieIndex: lie, statements: game.statements[storyteller.id]?.statements ?? [], correctCount: correct.length };
    } else {
      const counts = {};
      for (const target of Object.values(game.votes)) counts[target] = (counts[target] ?? 0) + 1;
      const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0];
      game.results = { location: game.location, spyId: game.spyId, spyName: playerName(game, game.spyId), caught: top === game.spyId, counts };
      for (const player of game.players) award(room, player.id, top === game.spyId && player.id !== game.spyId ? 1 : top !== game.spyId && player.id === game.spyId ? 2 : 0);
    }
    completeRound(game);
  }

  function action(room, game, playerId, payload = {}) {
    if (!playerInGame(game, playerId)) return { ok: false, code: "not_in_game", message: "You are not in this game." };
    const type = payload.type;
    if (kind === "would-you-rather") {
      if (type === "vote" && game.phase === "vote") { if (!['a','b'].includes(payload.choice) || game.votes[playerId]) return { ok:false, code:"invalid_vote", message:"Choose one option once." }; game.votes[playerId] = payload.choice; if (Object.keys(game.votes).length === game.players.length) game.phase = "explain"; return {ok:true}; }
      if (type === "explain" && game.phase === "explain") { if (game.explanations[playerId] !== undefined) return {ok:false,code:"already_explained",message:"Your reason is already saved."}; game.explanations[playerId] = cleanText(payload.text,180); if (Object.keys(game.explanations).length === game.players.length) finish(room,game); return {ok:true}; }
    } else if (kind === "caption-this") {
      if (type === "caption" && game.phase === "writing") { if (game.captions.some(c=>c.authorId===playerId)) return {ok:false,code:"already_submitted",message:"Your caption is already in."}; const text=cleanText(payload.caption,160); if(!text)return {ok:false,code:"empty_caption",message:"Write a caption first."}; game.captions.push({id:crypto.randomUUID(),authorId:playerId,text}); if(game.captions.length===game.players.length){game.captions=shuffle(game.captions);game.phase="voting";} return {ok:true}; }
      if (type === "vote" && game.phase === "voting") { const caption=game.captions.find(c=>c.id===payload.captionId); if(!caption||caption.authorId===playerId||game.votes[playerId]) return {ok:false,code:"invalid_vote",message:"Choose another caption once."}; game.votes[playerId]=caption.id; if(Object.keys(game.votes).length===game.captions.length) finish(room,game); return {ok:true}; }
    } else if (kind === "emoji-guess") {
      if (type === "skip" && game.phase === "guessing") {
        if (game.solved[playerId] || game.skipped[playerId]) {
          return { ok: false, code: "already_submitted", message: "Your answer is already recorded." };
        }
        game.skipped[playerId] = true;
        if (Object.keys(game.solved).length + Object.keys(game.skipped).length >= game.players.length) finish(room, game);
        return { ok: true, skipped: true };
      }
      if(type === "guess" && game.phase === "guessing"){ if(game.solved[playerId]||game.skipped[playerId])return{ok:false,code:"already_submitted",message:"Your answer is already recorded."}; const guess=cleanText(payload.guess,90); if(!guess)return{ok:false,code:"empty_guess",message:"Type a guess first."}; game.guesses[playerId]??=[]; if(game.guesses[playerId].includes(guess.toLowerCase()))return{ok:false,code:"duplicate_guess",message:"You already tried that."}; game.guesses[playerId].push(guess.toLowerCase()); if(answerMatches(guess,game.item)){game.solved[playerId]=Object.keys(game.solved).length===0?1:2; if(Object.keys(game.solved).length+Object.keys(game.skipped).length>=game.players.length)finish(room,game); return{ok:true,correct:true};} return{ok:true,correct:false}; }
    } else if (kind === "two-truths-one-lie") {
      if(type === "statements" && game.phase === "writing"){ if(game.statements[playerId])return{ok:false,code:"already_submitted",message:"Your statements are already in."}; const statements=Array.isArray(payload.statements)?payload.statements.map(v=>cleanText(v,140)):[]; const lieIndex=Number(payload.lieIndex); if(statements.length!==3||statements.some(v=>!v)||![0,1,2].includes(lieIndex))return{ok:false,code:"invalid_statements",message:"Send three statements and choose the lie."}; game.statements[playerId]={statements,lieIndex}; if(Object.keys(game.statements).length===game.players.length)game.phase="guessing"; return{ok:true}; }
      if(type === "guess" && game.phase === "guessing"){const storyteller=game.players[game.round-1]??game.players[0]; if(playerId===storyteller.id||game.guesses[playerId]!==undefined||![0,1,2].includes(Number(payload.statementIndex)))return{ok:false,code:"invalid_guess",message:"Choose one statement once."}; game.guesses[playerId]=Number(payload.statementIndex); if(Object.keys(game.guesses).length>=game.players.length-1)finish(room,game); return{ok:true};}
    } else {
      if(type === "ready" && game.phase === "reveal"){game.ready[playerId]=true;if(Object.keys(game.ready).length===game.players.length)game.phase="vote";return{ok:true};}
      if(type === "vote" && game.phase === "vote"){if(game.votes[playerId]||payload.targetId===playerId||!game.players.some(p=>p.id===payload.targetId))return{ok:false,code:"invalid_vote",message:"Choose another player once."};game.votes[playerId]=payload.targetId;if(Object.keys(game.votes).length===game.players.length)finish(room,game);return{ok:true};}
    }
    return {ok:false,code:"wrong_phase",message:"That action is not available now."};
  }

  function adminAction(room, game, type) { if (["reveal","skipRound","skipToResults","skipToVoting","revealResult","skipReveal","skipToVote"].includes(type)) { if (!game.scored) { if(kind==="caption-this"&&type==="skipToVoting"&&game.captions.length<2)return{ok:false,code:"not_enough",message:"Need two captions first."}; if(kind==="caption-this"&&type==="skipToVoting")game.phase="voting"; else finish(room,game); } return {ok:true}; } return {ok:false,code:"unknown_action",message:"Unknown host action."}; }
  function nextRound(room, game) { if(game.phase!=="results")return{ok:false,code:"wrong_phase",message:"The round is not finished."}; if(!setNextRound(game))return{ok:false,code:"complete",message:"All rounds are complete."}; begin(game,room); return{ok:true}; }
  function publicView(game) { const base={...publicBase(game),category:game.item?.category??null}; if(kind==="would-you-rather")return{...base,optionA:game.item.optionA,optionB:game.item.optionB,votedCount:submittedCount(game.votes),explainedCount:submittedCount(game.explanations),voteCounts:game.results?.counts??null,results:game.results?.explanations??null}; if(kind==="caption-this")return{...base,prompt:game.item,writingCount:game.captions.length,captions:game.phase==="voting"?game.captions.map(c=>({id:c.id,text:c.text})):game.phase==="writing"?[]:[],result:game.phase==="voting"||game.phase==="writing"?null:game.results}; if(kind==="emoji-guess")return{...base,puzzle:{emoji:game.item.emoji,category:game.item.category,hints:game.item.hints??[]},solvedCount:Object.keys(game.solved).length,skippedCount:Object.keys(game.skipped).length,totalPlayers:game.players.length,answer:game.phase==="guessing"?null:game.item.name,result:game.phase==="guessing"?null:game.results}; if(kind==="two-truths-one-lie"){const storyteller=game.players[game.round-1]??game.players[0];return{...base,storytellerId:storyteller?.id,storytellerName:storyteller?.name,statements:game.statements[storyteller?.id]?.statements??[],results:game.phase==="guessing"?null:game.results};} return{...base,location:game.phase==="results"||game.phase==="complete"?game.location:null,questionerName:null,readyCount:submittedCount(game.ready),voteCount:submittedCount(game.votes),result:game.results}; }
  function playerView(game, playerId) { if(kind==="would-you-rather")return{yourChoice:game.votes[playerId]??null,yourExplanation:game.explanations[playerId]??null,canVote:game.phase==="vote"&&!game.votes[playerId],canExplain:game.phase==="explain"&&game.explanations[playerId]===undefined}; if(kind==="caption-this")return{yourCaption:game.captions.find(c=>c.authorId===playerId)?.text??"",yourCaptionId:game.captions.find(c=>c.authorId===playerId)?.id??null,yourVote:game.votes[playerId]??null,canCaption:game.phase==="writing",canVote:game.phase==="voting"&&!game.votes[playerId]}; if(kind==="emoji-guess")return{puzzle:{emoji:game.item.emoji,category:game.item.category,hints:game.item.hints??[]},canGuess:game.phase==="guessing"&&!game.solved[playerId]&&!game.skipped[playerId],yourGuesses:game.guesses[playerId]??[],hasSolved:Boolean(game.solved[playerId]),hasSkipped:Boolean(game.skipped[playerId]),result:game.phase==="guessing"?null:game.results}; if(kind==="two-truths-one-lie")return{yourStatements:game.statements[playerId]??null,canSubmit:game.phase==="writing",canGuess:game.phase==="guessing"&&playerId!==(game.players[game.round-1]??game.players[0])?.id,yourGuess:game.guesses[playerId]??null,result:game.phase==="guessing"?null:game.results}; const isSpy=playerId===game.spyId;return{isSpy,role:isSpy?"spy":"agent",location:isSpy?null:game.location,canReady:game.phase==="reveal"&&!game.ready[playerId],canVote:game.phase==="vote"&&!game.votes[playerId],yourVote:game.votes[playerId]??null,result:game.phase==="results"||game.phase==="complete"?game.results:null}; }
  function adminView(game,room){return{...publicView(game),assignment:game.item,controls:game.phase==="results"?[control("nextRound","Next round","nextRound","primary")]:game.phase!=="complete"?[control("skipRound","Skip round","gameAction","tonal")]:[control("replay","Play again","replay","primary")],submissions:{votes:{count:submittedCount(game.votes),total:game.players.length},captions:{count:game.captions.length,total:game.players.length},solved:{count:Object.keys(game.solved).length,total:game.players.length},skipped:{count:submittedCount(game.skipped),total:game.players.length}}};}
  return {meta,create,action,adminAction,nextRound,publicView,playerView,adminView};
}
