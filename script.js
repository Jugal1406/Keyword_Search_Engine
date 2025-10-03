const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

class DocumentDatabase {
    constructor() {
        this.documents = JSON.parse(localStorage.getItem('documents') || '[]');
        this.searchIndex = JSON.parse(localStorage.getItem('searchIndex') || '{}');
    }
    save() { localStorage.setItem('documents', JSON.stringify(this.documents)); localStorage.setItem('searchIndex', JSON.stringify(this.searchIndex)); }
    addDocument(doc) {
        const id = Date.now().toString();
        const document = {id, name:doc.name, content:doc.content, wordCount:doc.content.split(/\s+/).length};
        this.documents.push(document);
        this.updateSearchIndex(document);
        this.save();
        return document;
    }
    updateSearchIndex(document) {
        const words = document.content.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w=>w.length>2);
        const wordFreq = {};
        words.forEach(word=>wordFreq[word]=(wordFreq[word]||0)+1);
        Object.keys(wordFreq).forEach(word=>{
            if(!this.searchIndex[word]) this.searchIndex[word]=[];
            this.searchIndex[word].push({docId:document.id, frequency:wordFreq[word], docName:document.name});
        });
    }
    getAllDocuments(){ return this.documents; }
    getDocument(id){ return this.documents.find(d=>d.id===id); }
    searchDocuments(query){
        query=query.toLowerCase();
        const results=[];
        const words = Object.keys(this.searchIndex).filter(w=>w.startsWith(query));
        words.forEach(word=>{
            this.searchIndex[word].forEach(item=>{
                const doc=this.documents.find(d=>d.id===item.docId);
                if(doc) results.push({document:doc, frequency:item.frequency, searchTerm:query});
            });
        });
        return results.sort((a,b)=>b.frequency-a.frequency);
    }
    clearAll(){
        this.documents=[]; this.searchIndex={}; this.save();
    }
}
const db = new DocumentDatabase();
let currentResults=[], currentSearchTerm='';

// Upload
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
uploadArea.addEventListener('click', ()=>fileInput.click());
uploadArea.addEventListener('dragover', e=>{e.preventDefault(); uploadArea.classList.add('dragover');});
uploadArea.addEventListener('dragleave', e=>{uploadArea.classList.remove('dragover');});
uploadArea.addEventListener('drop', e=>{e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(Array.from(e.dataTransfer.files));});
fileInput.addEventListener('change', e=>handleFiles(Array.from(e.target.files)));

async function handleFiles(files){
    document.getElementById('uploadLoading').classList.add('show');
    for(const file of files){
        try{
            let content='', ext=file.name.split('.').pop().toLowerCase();
            if(ext==='txt') content=await readText(file);
            else if(ext==='pdf') content=await readPdf(file);
            else if(ext==='docx') content=await readDocx(file);
            else { alert(`Unsupported: ${file.name}`); continue; }
            db.addDocument({name:file.name, content});
        }catch(err){console.error(err);}
    }
    document.getElementById('uploadLoading').classList.remove('show');
    updateDocumentList();
    fileInput.value='';
}

function readText(file){ return new Promise((res,rej)=>{ const reader=new FileReader(); reader.onload=e=>res(e.target.result); reader.onerror=rej; reader.readAsText(file);}); }
function readPdf(file){ return new Promise((res,rej)=>{ const reader=new FileReader(); reader.onload=async e=>{ try{ const typed=new Uint8Array(e.target.result); const pdf=await pdfjsLib.getDocument(typed).promise; let text=''; for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const content=await page.getTextContent(); text+=content.items.map(item=>item.str).join(' ')+'\n\n'; } res(text);}catch(err){rej(err);} }; reader.readAsArrayBuffer(file);}); }
function readDocx(file){ return new Promise((res,rej)=>{ const reader=new FileReader(); reader.onload=async e=>{ const result=await mammoth.extractRawText({arrayBuffer:e.target.result}); res(result.value); }; reader.readAsArrayBuffer(file);}); }

function updateDocumentList(){
    const docs=db.getAllDocuments();
    document.getElementById('docCount').textContent=docs.length;
    const list=document.getElementById('documentList');
    if(docs.length===0){ list.innerHTML='<div class="empty-state">No documents uploaded yet</div>'; return; }
    list.innerHTML=docs.map(d=>`<div class="document-item" onclick="viewDocument('${d.id}')"><div>${d.name}</div><div>${d.wordCount} words</div></div>`).join('');
}

// Clear All
function clearAllDocuments(){
    if(!confirm("Clear all documents? This cannot be undone.")) return;
    db.clearAll();
    updateDocumentList();
    document.getElementById('mainContent').innerHTML='<div class="empty-state">All documents cleared</div>';
}

// Search + Autocomplete
const searchInput=document.getElementById('searchInput');
const autocompleteList=document.getElementById('autocompleteList');

searchInput.addEventListener('input', ()=>{
    const query=searchInput.value.trim().toLowerCase();
    autocompleteList.innerHTML='';
    if(!query) return;
    const suggestions=new Set();
    db.getAllDocuments().forEach(doc=>{
        doc.content.toLowerCase().split(/\W+/).forEach(word=>{
            if(word.startsWith(query) && word.length>query.length) suggestions.add(word);
        });
    });
    Array.from(suggestions).slice(0,10).forEach(word=>{
        const li=document.createElement('li');
        li.textContent=word;
        li.addEventListener('click', ()=>{
            searchInput.value=word;
            autocompleteList.innerHTML='';
            performSearch();
        });
        autocompleteList.appendChild(li);
    });
});

document.addEventListener('click', e=>{
    if(!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) autocompleteList.innerHTML='';
});

function highlightSearchTerms(content, searchTerm){
    if(!searchTerm) return content.replace(/\n/g,'<br>');
    const regex=new RegExp(`(${searchTerm}\\w*)`,'gi');
    return content.replace(regex,'<span class="highlight">$1</span>').replace(/\n/g,'<br>');
}

function performSearch(){
    currentSearchTerm=searchInput.value.trim();
    if(!currentSearchTerm) return alert('Enter a search term');
    currentResults=db.searchDocuments(currentSearchTerm);
    displayResults();
}

function displayResults(){
    if(currentResults.length===0){ document.getElementById('mainContent').innerHTML='<div class="empty-state">No results found</div>'; return; }
    const listHTML=currentResults.map((res,i)=>{
        const count=(res.document.content.match(new RegExp(currentSearchTerm,'gi'))||[]).length;
        return `<span class="doc-link" onclick="viewResult(${i})">${res.document.name} (${count} occurrences)</span>`;
    }).join('');
    document.getElementById('mainContent').innerHTML=`<div>${listHTML}</div><div class="document-viewer" id="documentViewer" style="margin-top:20px;"><div class="empty-state">Select a document to preview</div></div>`;
}

function viewResult(index){
    const doc=currentResults[index].document;
    document.getElementById('documentViewer').innerHTML=highlightSearchTerms(doc.content,currentSearchTerm);
}

function viewDocument(id){
    const doc=db.getDocument(id);
    document.getElementById('mainContent').innerHTML=`<div class="document-viewer">${highlightSearchTerms(doc.content,'')}</div>`;
}

updateDocumentList();
